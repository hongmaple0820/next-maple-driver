import { createServer, IncomingMessage, ServerResponse } from 'http';
import { writeFile, mkdir, unlink, stat, copyFile } from 'fs/promises';
import { join } from 'path';
import { existsSync, createReadStream, copyFileSync } from 'fs';
import { randomUUID } from 'crypto';

// ─── Configuration ───────────────────────────────────────────────
const PORT = 3002;
const STORAGE_PATH = '/home/z/my-project/storage';
const DB_PATH = '/home/z/my-project/db/custom.db';
const AUTH_API_URL = 'http://localhost:3000/api/auth/verify-credentials';

// ─── Database (Bun SQLite) ───────────────────────────────────────
import { Database } from 'bun:sqlite';

let db: Database;

function initDb() {
  try {
    db = new Database(DB_PATH, { readonly: false, create: false });
    db.exec('PRAGMA journal_mode=WAL');
    db.exec('PRAGMA foreign_keys=ON');
    console.log('[WebDAV] Database connected');
  } catch (err) {
    console.error('[WebDAV] Failed to connect to database:', err);
    process.exit(1);
  }
}

// ─── Auth Cache ──────────────────────────────────────────────────
interface AuthInfo {
  id: string;
  email: string;
  name: string;
  role: string;
  expires: number;
}

const authCache = new Map<string, AuthInfo>();
const AUTH_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

async function authenticate(email: string, password: string): Promise<AuthInfo | null> {
  const cacheKey = `${email}:${password}`;
  const cached = authCache.get(cacheKey);
  if (cached && cached.expires > Date.now()) {
    return cached;
  }

  try {
    const response = await fetch(AUTH_API_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      return null;
    }

    const data = (await response.json()) as any;
    const authInfo: AuthInfo = {
      id: data.id,
      email: data.email,
      name: data.name,
      role: data.role,
      expires: Date.now() + AUTH_CACHE_TTL,
    };

    authCache.set(cacheKey, authInfo);
    return authInfo;
  } catch (err) {
    console.error('[WebDAV] Auth request failed:', err);
    return null;
  }
}

function parseBasicAuth(req: IncomingMessage): { email: string; password: string } | null {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith('Basic ')) {
    return null;
  }

  try {
    const decoded = Buffer.from(authHeader.slice(6), 'base64').toString('utf-8');
    const colonIndex = decoded.indexOf(':');
    if (colonIndex === -1) return null;
    return {
      email: decoded.slice(0, colonIndex),
      password: decoded.slice(colonIndex + 1),
    };
  } catch {
    return null;
  }
}

// ─── Path Resolution ─────────────────────────────────────────────
interface FileItem {
  id: string;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  parentId: string | null;
  storagePath: string | null;
  isStarred: number;
  isTrashed: number;
  userId: string | null;
  createdAt: string;
  updatedAt: string;
}

interface ResolvedItem {
  id: string | null;
  name: string;
  type: string;
  size: number;
  mimeType: string;
  parentId: string | null;
  storagePath: string | null;
  updatedAt: string;
  createdAt: string;
  isRoot: boolean;
}

function queryOne(sql: string, params: any[]): any | null {
  const stmt = db.prepare(sql);
  return stmt.get(...params) as any | null;
}

function queryAll(sql: string, params: any[]): any[] {
  const stmt = db.prepare(sql);
  return stmt.all(...params) as any[];
}

function run(sql: string, params: any[]): void {
  const stmt = db.prepare(sql);
  stmt.run(...params);
}

function toResolvedItem(row: any): ResolvedItem {
  return {
    id: row.id,
    name: row.name,
    type: row.type,
    size: row.size || 0,
    mimeType: row.mimeType || '',
    parentId: row.parentId,
    storagePath: row.storagePath,
    updatedAt: row.updatedAt,
    createdAt: row.createdAt,
    isRoot: false,
  };
}

async function resolvePath(urlPath: string, userId: string): Promise<ResolvedItem | null> {
  // Normalize and decode path
  let normalizedPath = decodeURIComponent(urlPath);
  // Remove trailing slash for resolution (except root)
  if (normalizedPath !== '/' && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  // Root path - return a virtual root item
  if (normalizedPath === '' || normalizedPath === '/') {
    return {
      id: null,
      name: '/',
      type: 'folder',
      size: 0,
      mimeType: '',
      parentId: null,
      storagePath: null,
      updatedAt: new Date().toISOString(),
      createdAt: new Date().toISOString(),
      isRoot: true,
    };
  }

  // Split path into segments
  const segments = normalizedPath.split('/').filter(Boolean);

  let currentParentId: string | null = null;

  for (let i = 0; i < segments.length; i++) {
    const segment = segments[i];
    const isLast = i === segments.length - 1;

    const row = queryOne(
      'SELECT * FROM FileItem WHERE parentId IS ? AND name = ? AND isTrashed = 0 AND userId = ? LIMIT 1',
      [currentParentId, segment, userId]
    );

    if (!row) {
      return null;
    }

    if (isLast) {
      return toResolvedItem(row);
    }

    // If not the last segment, it must be a folder to continue
    if (row.type !== 'folder') {
      return null;
    }

    currentParentId = row.id;
  }

  return null;
}

// Get the parent path and name from a full path
function splitPath(urlPath: string): { parentPath: string; name: string } {
  let normalizedPath = decodeURIComponent(urlPath);
  if (normalizedPath !== '/' && normalizedPath.endsWith('/')) {
    normalizedPath = normalizedPath.slice(0, -1);
  }

  const lastSlash = normalizedPath.lastIndexOf('/');
  if (lastSlash <= 0) {
    return {
      parentPath: '/',
      name: normalizedPath.slice(1),
    };
  }

  return {
    parentPath: normalizedPath.slice(0, lastSlash) || '/',
    name: normalizedPath.slice(lastSlash + 1),
  };
}

// ─── XML Helpers ─────────────────────────────────────────────────
function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function formatDate(dateStr: string): string {
  try {
    return new Date(dateStr).toUTCString();
  } catch {
    return new Date().toUTCString();
  }
}

function buildPropfindResponse(
  href: string,
  item: ResolvedItem,
  isCollection: boolean
): string {
  const resourceType = isCollection
    ? '<D:resourcetype><D:collection/></D:resourcetype>'
    : '<D:resourcetype/>';

  const contentLength = item.size ?? 0;
  const lastModified = formatDate(item.updatedAt);
  const contentType = item.mimeType || 'application/octet-stream';
  const displayName = item.name === '/' ? '' : item.name;
  const creationDate = item.createdAt
    ? new Date(item.createdAt).toISOString()
    : new Date().toISOString();

  return `
  <D:response>
    <D:href>${escapeXml(href)}</D:href>
    <D:propstat>
      <D:prop>
        ${resourceType}
        <D:getcontentlength>${contentLength}</D:getcontentlength>
        <D:getlastmodified>${escapeXml(lastModified)}</D:getlastmodified>
        <D:creationdate>${escapeXml(creationDate)}</D:creationdate>
        <D:getcontenttype>${escapeXml(contentType)}</D:getcontenttype>
        <D:displayname>${escapeXml(displayName)}</D:displayname>
        <D:supportedlock>
          <D:lockentry>
            <D:lockscope><D:exclusive/></D:lockscope>
            <D:locktype><D:write/></D:locktype>
          </D:lockentry>
        </D:supportedlock>
      </D:prop>
      <D:status>HTTP/1.1 200 OK</D:status>
    </D:propstat>
  </D:response>`;
}

// ─── WebDAV Methods ──────────────────────────────────────────────

async function handleOptions(req: IncomingMessage, res: ServerResponse) {
  res.writeHead(200, {
    Allow: 'OPTIONS, GET, HEAD, PUT, DELETE, MKCOL, PROPFIND, COPY, MOVE, LOCK, UNLOCK',
    DAV: '1, 2',
    'MS-Author-Via': 'DAV',
    'Content-Length': '0',
  });
  res.end();
}

async function handlePropfind(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const item = await resolvePath(urlPath, authInfo.id);

    if (!item) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    const isCollection = item.type === 'folder' || item.isRoot;
    const href = urlPath === '/' ? '/' : isCollection ? urlPath + '/' : urlPath;

    let responses = '';

    // Add the resource itself
    responses += buildPropfindResponse(href, item, isCollection);

    // If it's a collection and depth is not 0, list children
    const depth = req.headers.depth;
    if (isCollection && depth !== '0') {
      const parentId = item.isRoot ? null : item.id;
      const children = queryAll(
        'SELECT * FROM FileItem WHERE parentId IS ? AND isTrashed = 0 AND userId = ? ORDER BY type DESC, name ASC',
        [parentId, authInfo.id]
      );

      for (const child of children) {
        const childItem = toResolvedItem(child);
        const childIsCollection = child.type === 'folder';
        const childHref = childIsCollection
          ? `${href}${encodeURIComponent(child.name)}/`
          : `${href}${encodeURIComponent(child.name)}`;
        responses += buildPropfindResponse(childHref, childItem, childIsCollection);
      }
    }

    const xml = `<?xml version="1.0" encoding="utf-8"?>
<D:multistatus xmlns:D="DAV:">${responses}
</D:multistatus>`;

    res.writeHead(207, {
      'Content-Type': 'application/xml; charset=utf-8',
      'Content-Length': Buffer.byteLength(xml, 'utf-8'),
    });
    res.end(xml);
  } catch (err) {
    console.error('[WebDAV] PROPFIND error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

async function handleGet(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const item = await resolvePath(urlPath, authInfo.id);

    if (!item || item.isRoot || item.type === 'folder') {
      // For folders, return a simple HTML listing
      if (item && (item.isRoot || item.type === 'folder')) {
        const parentId = item.isRoot ? null : item.id;
        const children = queryAll(
          'SELECT * FROM FileItem WHERE parentId IS ? AND isTrashed = 0 AND userId = ? ORDER BY type DESC, name ASC',
          [parentId, authInfo.id]
        );

        let html = '<html><head><meta charset="utf-8"><title>CloudDrive</title></head><body><ul>';
        for (const child of children) {
          const childPath =
            urlPath === '/'
              ? `/${encodeURIComponent(child.name)}`
              : `${urlPath}/${encodeURIComponent(child.name)}`;
          const icon = child.type === 'folder' ? '📁' : '📄';
          html += `<li>${icon} <a href="${childPath}">${escapeXml(child.name)}</a></li>`;
        }
        html += '</ul></body></html>';

        res.writeHead(200, {
          'Content-Type': 'text/html; charset=utf-8',
          'Content-Length': Buffer.byteLength(html, 'utf-8'),
        });
        res.end(html);
        return;
      }

      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Stream file from storage
    const filePath = join(STORAGE_PATH, item.storagePath || '');
    if (!item.storagePath || !existsSync(filePath)) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('File not found on disk');
      return;
    }

    const fileStat = await stat(filePath);
    res.writeHead(200, {
      'Content-Type': item.mimeType || 'application/octet-stream',
      'Content-Length': fileStat.size,
      'Last-Modified': formatDate(item.updatedAt),
      'Content-Disposition': `inline; filename="${escapeXml(item.name)}"`,
    });

    const stream = createReadStream(filePath);
    stream.pipe(res);

    stream.on('error', () => {
      if (!res.headersSent) {
        res.writeHead(500, { 'Content-Type': 'text/plain' });
        res.end('Error reading file');
      }
    });
  } catch (err) {
    console.error('[WebDAV] GET error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

async function handleHead(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const item = await resolvePath(urlPath, authInfo.id);

    if (!item) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end();
      return;
    }

    if (item.isRoot || item.type === 'folder') {
      res.writeHead(200, {
        'Content-Type': 'text/html; charset=utf-8',
        'Last-Modified': formatDate(item.updatedAt),
      });
      res.end();
      return;
    }

    const filePath = join(STORAGE_PATH, item.storagePath || '');
    let fileSize = item.size;

    if (item.storagePath && existsSync(filePath)) {
      const fileStat = await stat(filePath);
      fileSize = fileStat.size;
    }

    res.writeHead(200, {
      'Content-Type': item.mimeType || 'application/octet-stream',
      'Content-Length': fileSize,
      'Last-Modified': formatDate(item.updatedAt),
    });
    res.end();
  } catch (err) {
    console.error('[WebDAV] HEAD error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end();
  }
}

async function handlePut(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const { parentPath, name } = splitPath(urlPath);

    // Resolve parent folder
    const parentItem = await resolvePath(parentPath, authInfo.id);
    if (!parentItem || (parentItem.type !== 'folder' && !parentItem.isRoot)) {
      res.writeHead(409, { 'Content-Type': 'text/plain' });
      res.end('Conflict: Parent folder does not exist');
      return;
    }

    const parentId = parentItem.isRoot ? null : parentItem.id;

    // Check if file already exists at this path
    const existingFile = queryOne(
      'SELECT * FROM FileItem WHERE parentId IS ? AND name = ? AND type = ? AND isTrashed = 0 AND userId = ? LIMIT 1',
      [parentId, name, 'file', authInfo.id]
    );

    // Generate storage name
    const fileId = randomUUID();
    const ext = name.includes('.') ? '.' + name.split('.').pop() : '';
    const storageName = `${fileId}${ext}`;
    const filePath = join(STORAGE_PATH, storageName);

    // Ensure storage directory exists
    if (!existsSync(STORAGE_PATH)) {
      await mkdir(STORAGE_PATH, { recursive: true });
    }

    // Read request body
    const chunks: Buffer[] = [];
    let totalSize = 0;

    await new Promise<void>((resolve, reject) => {
      req.on('data', (chunk: Buffer) => {
        chunks.push(chunk);
        totalSize += chunk.length;
      });
      req.on('end', () => resolve());
      req.on('error', (err) => reject(err));
    });

    const buffer = Buffer.concat(chunks);
    await writeFile(filePath, buffer);

    // Determine MIME type
    const mimeType = req.headers['content-type'] || 'application/octet-stream';

    const now = new Date().toISOString();

    if (existingFile) {
      // Update existing file - update storage path and size
      const oldStoragePath = existingFile.storagePath;

      run(
        'UPDATE FileItem SET storagePath = ?, size = ?, mimeType = ?, updatedAt = ? WHERE id = ?',
        [storageName, totalSize, mimeType, now, existingFile.id]
      );

      // Delete old file from disk
      if (oldStoragePath) {
        const oldFilePath = join(STORAGE_PATH, oldStoragePath);
        try {
          if (existsSync(oldFilePath)) {
            await unlink(oldFilePath);
          }
        } catch {
          // Ignore cleanup errors
        }
      }

      res.writeHead(204, { 'Content-Length': '0' });
      res.end();
    } else {
      // Create new file record
      run(
        'INSERT INTO FileItem (id, name, type, size, mimeType, parentId, storagePath, isStarred, isTrashed, colorLabel, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)',
        [fileId, name, 'file', totalSize, mimeType, parentId, storageName, '', authInfo.id, now, now]
      );

      res.writeHead(201, { 'Content-Length': '0' });
      res.end();
    }
  } catch (err) {
    console.error('[WebDAV] PUT error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

async function handleMkcol(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const { parentPath, name } = splitPath(urlPath);

    // Resolve parent folder
    const parentItem = await resolvePath(parentPath, authInfo.id);
    if (!parentItem || (parentItem.type !== 'folder' && !parentItem.isRoot)) {
      res.writeHead(409, { 'Content-Type': 'text/plain' });
      res.end('Conflict: Parent folder does not exist');
      return;
    }

    const parentId = parentItem.isRoot ? null : parentItem.id;

    // Check if item already exists
    const existing = queryOne(
      'SELECT * FROM FileItem WHERE parentId IS ? AND name = ? AND isTrashed = 0 AND userId = ? LIMIT 1',
      [parentId, name, authInfo.id]
    );

    if (existing) {
      if (existing.type === 'folder') {
        // Folder already exists - return 405 per WebDAV spec
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed: Folder already exists');
      } else {
        res.writeHead(405, { 'Content-Type': 'text/plain' });
        res.end('Method Not Allowed: A file with this name already exists');
      }
      return;
    }

    // Create folder
    const folderId = randomUUID();
    const now = new Date().toISOString();
    run(
      'INSERT INTO FileItem (id, name, type, size, mimeType, parentId, storagePath, isStarred, isTrashed, colorLabel, userId, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, NULL, 0, 0, ?, ?, ?, ?)',
      [folderId, name, 'folder', '', '', authInfo.id, now, now]
    );

    res.writeHead(201, { 'Content-Length': '0' });
    res.end();
  } catch (err) {
    console.error('[WebDAV] MKCOL error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

function trashItemRecursively(id: string) {
  const children = queryAll(
    'SELECT id FROM FileItem WHERE parentId = ?',
    [id]
  );

  for (const child of children) {
    trashItemRecursively(child.id);
  }

  run('UPDATE FileItem SET isTrashed = 1 WHERE id = ?', [id]);
}

async function handleDelete(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;

  try {
    const item = await resolvePath(urlPath, authInfo.id);

    if (!item || item.isRoot) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Move to trash (mark as trashed)
    trashItemRecursively(item.id!);

    res.writeHead(204, { 'Content-Length': '0' });
    res.end();
  } catch (err) {
    console.error('[WebDAV] DELETE error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

async function handleCopy(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
  const destination = req.headers.destination as string;

  if (!destination) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: Destination header required');
    return;
  }

  try {
    const item = await resolvePath(urlPath, authInfo.id);
    if (!item || item.isRoot) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Parse destination path
    let destPath: string;
    try {
      const destUrl = new URL(destination);
      destPath = destUrl.pathname;
    } catch {
      // Destination might be a path without a full URL
      destPath = destination;
    }

    const { parentPath: destParentPath, name: destName } = splitPath(destPath);

    // Resolve destination parent
    const destParent = await resolvePath(destParentPath, authInfo.id);
    if (!destParent || (destParent.type !== 'folder' && !destParent.isRoot)) {
      res.writeHead(409, { 'Content-Type': 'text/plain' });
      res.end('Conflict: Destination parent does not exist');
      return;
    }

    const destParentId = destParent.isRoot ? null : destParent.id;

    // Check if destination already exists
    const existingDest = queryOne(
      'SELECT * FROM FileItem WHERE parentId IS ? AND name = ? AND isTrashed = 0 AND userId = ? AND id != ? LIMIT 1',
      [destParentId, destName, authInfo.id, item.id]
    );

    const overwrite = req.headers['overwrite'] !== 'F';

    if (existingDest && !overwrite) {
      res.writeHead(412, { 'Content-Type': 'text/plain' });
      res.end('Precondition Failed: Destination exists and Overwrite is F');
      return;
    }

    if (existingDest && overwrite) {
      // Delete existing destination
      trashItemRecursively(existingDest.id);
    }

    // Copy the item
    copyItemRecursively(item.id!, destParentId, destName, authInfo.id);

    res.writeHead(existingDest ? 204 : 201, { 'Content-Length': '0' });
    res.end();
  } catch (err) {
    console.error('[WebDAV] COPY error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

function copyItemRecursively(
  sourceId: string,
  destParentId: string | null,
  destName: string,
  userId: string
) {
  const source = queryOne('SELECT * FROM FileItem WHERE id = ? LIMIT 1', [sourceId]);
  if (!source) return;

  const newId = randomUUID();
  const now = new Date().toISOString();

  if (source.type === 'folder') {
    run(
      'INSERT INTO FileItem (id, name, type, size, mimeType, parentId, storagePath, isStarred, isTrashed, colorLabel, userId, createdAt, updatedAt) VALUES (?, ?, ?, 0, ?, ?, NULL, 0, 0, ?, ?, ?, ?)',
      [newId, destName, 'folder', '', destParentId, '', userId, now, now]
    );

    // Copy children
    const children = queryAll(
      'SELECT * FROM FileItem WHERE parentId = ? AND isTrashed = 0',
      [sourceId]
    );

    for (const child of children) {
      copyItemRecursively(child.id, newId, child.name, userId);
    }
  } else {
    // Copy file
    let newStoragePath = source.storagePath;

    if (source.storagePath) {
      const ext = source.name.includes('.') ? '.' + source.name.split('.').pop() : '';
      newStoragePath = `${newId}${ext}`;
      const sourceFilePath = join(STORAGE_PATH, source.storagePath);
      const destFilePath = join(STORAGE_PATH, newStoragePath);

      if (existsSync(sourceFilePath)) {
        copyFileSync(sourceFilePath, destFilePath);
      }
    }

    run(
      'INSERT INTO FileItem (id, name, type, size, mimeType, parentId, storagePath, isStarred, isTrashed, colorLabel, userId, createdAt, updatedAt) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, ?, ?, ?, ?)',
      [newId, destName, source.type, source.size, source.mimeType, destParentId, newStoragePath, '', userId, now, now]
    );
  }
}

async function handleMove(req: IncomingMessage, res: ServerResponse, authInfo: AuthInfo) {
  const urlPath = new URL(req.url || '/', `http://${req.headers.host}`).pathname;
  const destination = req.headers.destination as string;

  if (!destination) {
    res.writeHead(400, { 'Content-Type': 'text/plain' });
    res.end('Bad Request: Destination header required');
    return;
  }

  try {
    const item = await resolvePath(urlPath, authInfo.id);
    if (!item || item.isRoot) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('Not Found');
      return;
    }

    // Parse destination path
    let destPath: string;
    try {
      const destUrl = new URL(destination);
      destPath = destUrl.pathname;
    } catch {
      destPath = destination;
    }

    const { parentPath: destParentPath, name: destName } = splitPath(destPath);

    // Resolve destination parent
    const destParent = await resolvePath(destParentPath, authInfo.id);
    if (!destParent || (destParent.type !== 'folder' && !destParent.isRoot)) {
      res.writeHead(409, { 'Content-Type': 'text/plain' });
      res.end('Conflict: Destination parent does not exist');
      return;
    }

    const destParentId = destParent.isRoot ? null : destParent.id;

    // Check if destination already exists
    const existingDest = queryOne(
      'SELECT * FROM FileItem WHERE parentId IS ? AND name = ? AND isTrashed = 0 AND userId = ? AND id != ? LIMIT 1',
      [destParentId, destName, authInfo.id, item.id]
    );

    const overwrite = req.headers['overwrite'] !== 'F';

    if (existingDest && !overwrite) {
      res.writeHead(412, { 'Content-Type': 'text/plain' });
      res.end('Precondition Failed: Destination exists and Overwrite is F');
      return;
    }

    if (existingDest && overwrite) {
      // Delete existing destination
      trashItemRecursively(existingDest.id);
    }

    // Move the item (update parentId and name)
    const now = new Date().toISOString();
    run(
      'UPDATE FileItem SET parentId = ?, name = ?, updatedAt = ? WHERE id = ?',
      [destParentId, destName, now, item.id]
    );

    res.writeHead(existingDest ? 204 : 201, { 'Content-Length': '0' });
    res.end();
  } catch (err) {
    console.error('[WebDAV] MOVE error:', err);
    res.writeHead(500, { 'Content-Type': 'text/plain' });
    res.end('Internal Server Error');
  }
}

// ─── Request Handler ─────────────────────────────────────────────

async function handleRequest(req: IncomingMessage, res: ServerResponse) {
  const method = req.method?.toUpperCase() || 'GET';

  // Log requests in debug mode
  if (process.env.DEBUG) {
    console.log(`[WebDAV] ${method} ${req.url}`);
  }

  // Handle OPTIONS without auth (needed for WebDAV discovery)
  if (method === 'OPTIONS') {
    return handleOptions(req, res);
  }

  // Authenticate all other requests
  const credentials = parseBasicAuth(req);
  if (!credentials) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="CloudDrive WebDAV"',
      'Content-Type': 'text/plain',
    });
    res.end('Authentication required');
    return;
  }

  const authInfo = await authenticate(credentials.email, credentials.password);
  if (!authInfo) {
    res.writeHead(401, {
      'WWW-Authenticate': 'Basic realm="CloudDrive WebDAV"',
      'Content-Type': 'text/plain',
    });
    res.end('Invalid credentials');
    return;
  }

  // Route to handler
  switch (method) {
    case 'PROPFIND':
      return handlePropfind(req, res, authInfo);
    case 'GET':
      return handleGet(req, res, authInfo);
    case 'HEAD':
      return handleHead(req, res, authInfo);
    case 'PUT':
      return handlePut(req, res, authInfo);
    case 'MKCOL':
      return handleMkcol(req, res, authInfo);
    case 'DELETE':
      return handleDelete(req, res, authInfo);
    case 'COPY':
      return handleCopy(req, res, authInfo);
    case 'MOVE':
      return handleMove(req, res, authInfo);
    default:
      res.writeHead(405, { 'Content-Type': 'text/plain' });
      res.end('Method Not Allowed');
  }
}

// ─── Server Start ────────────────────────────────────────────────

function start() {
  initDb();

  const server = createServer(handleRequest);

  server.listen(PORT, () => {
    console.log(`[WebDAV] Server running on port ${PORT}`);
    console.log(`[WebDAV] Storage path: ${STORAGE_PATH}`);
    console.log(`[WebDAV] Auth API: ${AUTH_API_URL}`);
    console.log(`[WebDAV] Database: ${DB_PATH}`);
    console.log(`[WebDAV] Connect with: https://<host>/api/webdav/?XTransformPort=${PORT}`);
  });

  server.on('error', (err: any) => {
    if (err.code === 'EADDRINUSE') {
      console.error(`[WebDAV] Port ${PORT} is already in use`);
    } else {
      console.error('[WebDAV] Server error:', err);
    }
  });

  // Graceful shutdown
  process.on('SIGINT', () => {
    console.log('[WebDAV] Shutting down...');
    server.close();
    db.close();
    process.exit(0);
  });

  process.on('SIGTERM', () => {
    console.log('[WebDAV] Shutting down...');
    server.close();
    db.close();
    process.exit(0);
  });
}

start();
