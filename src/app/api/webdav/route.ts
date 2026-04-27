import { NextRequest, NextResponse } from 'next/server';

const WEBDAV_PORT = 3002;

// Proxy WebDAV requests to the WebDAV mini-service
export async function PROPFIND(request: NextRequest) {
  return proxyRequest(request);
}

export async function GET(request: NextRequest) {
  return proxyRequest(request);
}

export async function PUT(request: NextRequest) {
  return proxyRequest(request);
}

export async function MKCOL(request: NextRequest) {
  return proxyRequest(request);
}

export async function DELETE(request: NextRequest) {
  return proxyRequest(request);
}

export async function COPY(request: NextRequest) {
  return proxyRequest(request);
}

export async function MOVE(request: NextRequest) {
  return proxyRequest(request);
}

export async function OPTIONS(request: NextRequest) {
  return proxyRequest(request);
}

export async function HEAD(request: NextRequest) {
  return proxyRequest(request);
}

export async function LOCK(request: NextRequest) {
  return proxyRequest(request);
}

export async function UNLOCK(request: NextRequest) {
  return proxyRequest(request);
}

async function proxyRequest(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const targetUrl = `http://localhost:${WEBDAV_PORT}${url.pathname}${url.search}`;

    const headers = new Headers(request.headers);
    headers.set('host', `localhost:${WEBDAV_PORT}`);

    const body = request.method !== 'GET' && request.method !== 'HEAD' && request.method !== 'OPTIONS'
      ? await request.arrayBuffer()
      : undefined;

    const response = await fetch(targetUrl, {
      method: request.method,
      headers,
      body: body ? Buffer.from(body) : undefined,
    });

    const responseHeaders = new Headers(response.headers);
    // Remove transfer-encoding to avoid issues
    responseHeaders.delete('transfer-encoding');

    return new NextResponse(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: responseHeaders,
    });
  } catch (error) {
    console.error('[WebDAV Proxy] Error:', error);
    return NextResponse.json(
      { error: 'WebDAV service unavailable' },
      { status: 503 }
    );
  }
}
