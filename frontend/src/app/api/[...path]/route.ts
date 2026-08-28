import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.BACKEND_INTERNAL_URL || 'http://127.0.0.1:8000';

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
export const maxDuration = 300; // Allow long-running uploads / inference streams

async function forwardRequest(req: NextRequest, { params }: { params: Promise<{ path: string[] }> }) {
  const resolvedParams = await params;
  const path = resolvedParams.path ? resolvedParams.path.join('/') : '';
  const search = req.nextUrl.search;
  const targetUrl = `${BACKEND_URL}/api/${path}${search}`;

  const headers = new Headers();
  req.headers.forEach((value, key) => {
    const k = key.toLowerCase();
    // Exclude host, connection, and content-length to let fetch manage boundaries correctly
    if (k !== 'host' && k !== 'connection') {
      headers.set(key, value);
    }
  });

  try {
    let body: BodyInit | null = null;
    if (req.method !== 'GET' && req.method !== 'HEAD') {
      // Get raw body as ArrayBuffer for multipart uploads and JSON
      const buffer = await req.arrayBuffer();
      body = buffer.byteLength > 0 ? buffer : null;
    }

    const res = await fetch(targetUrl, {
      method: req.method,
      headers,
      body,
      // @ts-ignore
      duplex: 'half',
      cache: 'no-store',
    });

    const responseHeaders = new Headers();
    res.headers.forEach((value, key) => {
      responseHeaders.set(key, value);
    });

    return new NextResponse(res.body, {
      status: res.status,
      statusText: res.statusText,
      headers: responseHeaders,
    });
  } catch (err: any) {
    console.error(`[API Gateway Error] ${req.method} ${targetUrl}:`, err);
    return NextResponse.json(
      { detail: `Backend proxy connection failed: ${err.message}` },
      { status: 502 }
    );
  }
}

export {
  forwardRequest as GET,
  forwardRequest as POST,
  forwardRequest as PUT,
  forwardRequest as DELETE,
  forwardRequest as PATCH,
};
