import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { existsSync, readdirSync, unlinkSync, statSync } from "fs";
import { join } from "path";
import { db } from "@/lib/db";

async function requireAdmin() {
  const session = await getServerSession(authOptions);
  if (!session?.user || (session.user as Record<string, unknown>).role !== "admin") {
    return null;
  }
  return session;
}

// POST /api/admin/disk/cleanup - Perform cleanup actions
export async function POST(request: NextRequest) {
  try {
    const session = await requireAdmin();
    if (!session) {
      return NextResponse.json({ error: "Admin access required" }, { status: 403 });
    }

    const body = await request.json();
    const { action, execute } = body as {
      action: "orphaned-files" | "orphaned-records" | "expired-shares" | "expired-transfers";
      execute?: boolean;
    };

    switch (action) {
      case "orphaned-files":
        return await handleOrphanedFiles(execute);
      case "orphaned-records":
        return await handleOrphanedRecords(execute);
      case "expired-shares":
        return await handleExpiredShares(execute);
      case "expired-transfers":
        return await handleExpiredTransfers(execute);
      default:
        return NextResponse.json({ error: "Invalid action" }, { status: 400 });
    }
  } catch (error) {
    console.error("Error during cleanup:", error);
    return NextResponse.json({ error: "Cleanup failed" }, { status: 500 });
  }
}

async function handleOrphanedFiles(execute?: boolean) {
  const storagePath = join(process.cwd(), "storage");

  if (!existsSync(storagePath)) {
    return NextResponse.json({ items: [], count: 0, executed: false });
  }

  // Get all storage paths from database
  const fileItems = await db.fileItem.findMany({
    where: {
      type: "file",
      storagePath: { not: null },
    },
    select: { storagePath: true },
  });

  const versionItems = await db.fileVersion.findMany({
    where: { storagePath: { not: null } },
    select: { storagePath: true },
  });

  const transferItems = await db.transferFile.findMany({
    select: { storagePath: true },
  });

  // Build a set of all known storage paths
  const knownPaths = new Set<string>();
  for (const item of fileItems) {
    if (item.storagePath) knownPaths.add(item.storagePath);
  }
  for (const item of versionItems) {
    if (item.storagePath) knownPaths.add(item.storagePath);
  }
  for (const item of transferItems) {
    if (item.storagePath) knownPaths.add(item.storagePath);
  }

  // Scan storage directory for files
  const orphanedFiles: Array<{ path: string; size: number }> = [];

  function scanDir(dirPath: string) {
    try {
      const entries = readdirSync(dirPath, { withFileTypes: true });
      for (const entry of entries) {
        if (entry.name.startsWith(".")) continue;
        const fullPath = join(dirPath, entry.name);
        if (entry.isDirectory()) {
          scanDir(fullPath);
        } else if (entry.isFile()) {
          if (!knownPaths.has(fullPath)) {
            try {
              const stats = statSync(fullPath);
              orphanedFiles.push({ path: fullPath, size: stats.size });
            } catch {
              orphanedFiles.push({ path: fullPath, size: 0 });
            }
          }
        }
      }
    } catch {
      // Skip inaccessible directories
    }
  }

  scanDir(storagePath);

  if (execute && orphanedFiles.length > 0) {
    let deletedCount = 0;
    for (const file of orphanedFiles) {
      try {
        unlinkSync(file.path);
        deletedCount++;
      } catch {
        // Skip files that can't be deleted
      }
    }
    return NextResponse.json({
      items: orphanedFiles.map((f) => ({ path: f.path, size: f.size })),
      count: orphanedFiles.length,
      executed: true,
      deletedCount,
    });
  }

  return NextResponse.json({
    items: orphanedFiles.map((f) => ({ path: f.path, size: f.size })),
    count: orphanedFiles.length,
    executed: false,
  });
}

async function handleOrphanedRecords(execute?: boolean) {
  // Find file records with storage paths that don't exist on disk
  const fileItems = await db.fileItem.findMany({
    where: {
      type: "file",
      storagePath: { not: null },
      isTrashed: false,
    },
    select: { id: true, name: true, storagePath: true },
  });

  const orphanedRecords: Array<{ id: string; name: string; storagePath: string }> = [];

  for (const item of fileItems) {
    if (item.storagePath && !existsSync(item.storagePath)) {
      orphanedRecords.push({
        id: item.id,
        name: item.name,
        storagePath: item.storagePath,
      });
    }
  }

  // Also check file versions
  const versionItems = await db.fileVersion.findMany({
    where: { storagePath: { not: null } },
    select: { id: true, name: true, storagePath: true },
  });

  const orphanedVersions: Array<{ id: string; name: string; storagePath: string }> = [];

  for (const item of versionItems) {
    if (item.storagePath && !existsSync(item.storagePath)) {
      orphanedVersions.push({
        id: item.id,
        name: item.name,
        storagePath: item.storagePath,
      });
    }
  }

  if (execute) {
    let markedCount = 0;
    // Mark orphaned file records as trashed
    for (const record of orphanedRecords) {
      try {
        await db.fileItem.update({
          where: { id: record.id },
          data: { isTrashed: true },
        });
        markedCount++;
      } catch {
        // Skip records that can't be updated
      }
    }

    // Delete orphaned version records
    let deletedVersions = 0;
    for (const record of orphanedVersions) {
      try {
        await db.fileVersion.delete({
          where: { id: record.id },
        });
        deletedVersions++;
      } catch {
        // Skip records that can't be deleted
      }
    }

    return NextResponse.json({
      items: orphanedRecords.map((r) => ({ id: r.id, name: r.name, storagePath: r.storagePath })),
      orphanedVersions: orphanedVersions.map((r) => ({ id: r.id, name: r.name, storagePath: r.storagePath })),
      count: orphanedRecords.length + orphanedVersions.length,
      executed: true,
      markedCount,
      deletedVersions,
    });
  }

  return NextResponse.json({
    items: orphanedRecords.map((r) => ({ id: r.id, name: r.name, storagePath: r.storagePath })),
    orphanedVersions: orphanedVersions.map((r) => ({ id: r.id, name: r.name, storagePath: r.storagePath })),
    count: orphanedRecords.length + orphanedVersions.length,
    executed: false,
  });
}

async function handleExpiredShares(execute?: boolean) {
  const now = new Date();

  const expiredShares = await db.shareLink.findMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
    select: {
      id: true,
      token: true,
      expiresAt: true,
      file: { select: { name: true } },
    },
  });

  if (execute && expiredShares.length > 0) {
    const result = await db.shareLink.deleteMany({
      where: {
        expiresAt: { not: null, lt: now },
      },
    });

    return NextResponse.json({
      items: expiredShares.map((s) => ({
        id: s.id,
        token: s.token,
        expiresAt: s.expiresAt?.toISOString(),
        fileName: s.file?.name,
      })),
      count: expiredShares.length,
      executed: true,
      deletedCount: result.count,
    });
  }

  return NextResponse.json({
    items: expiredShares.map((s) => ({
      id: s.id,
      token: s.token,
      expiresAt: s.expiresAt?.toISOString(),
      fileName: s.file?.name,
    })),
    count: expiredShares.length,
    executed: false,
  });
}

async function handleExpiredTransfers(execute?: boolean) {
  const now = new Date();

  const expiredTransfers = await db.transferFile.findMany({
    where: {
      expiresAt: { not: null, lt: now },
    },
    select: {
      id: true,
      token: true,
      fileName: true,
      storagePath: true,
      expiresAt: true,
    },
  });

  if (execute && expiredTransfers.length > 0) {
    // Delete files from disk first
    let deletedFiles = 0;
    for (const transfer of expiredTransfers) {
      if (transfer.storagePath && existsSync(transfer.storagePath)) {
        try {
          unlinkSync(transfer.storagePath);
          deletedFiles++;
        } catch {
          // Skip files that can't be deleted
        }
      }
    }

    // Delete database records
    const result = await db.transferFile.deleteMany({
      where: {
        expiresAt: { not: null, lt: now },
      },
    });

    return NextResponse.json({
      items: expiredTransfers.map((t) => ({
        id: t.id,
        token: t.token,
        fileName: t.fileName,
        expiresAt: t.expiresAt?.toISOString(),
      })),
      count: expiredTransfers.length,
      executed: true,
      deletedFiles,
      deletedRecords: result.count,
    });
  }

  return NextResponse.json({
    items: expiredTransfers.map((t) => ({
      id: t.id,
      token: t.token,
      fileName: t.fileName,
      expiresAt: t.expiresAt?.toISOString(),
    })),
    count: expiredTransfers.length,
    executed: false,
  });
}
