import { NextRequest, NextResponse } from 'next/server'

export async function middleware(request: NextRequest) {
  if (request.nextUrl.pathname.startsWith('/api/')) {
    const url = 'http://localhost:8000' + request.nextUrl.pathname + request.nextUrl.search
    const response = await fetch(url, {
      method: request.method,
      headers: Object.fromEntries(request.headers.entries()),
      body: request.method !== 'GET' && request.method !== 'HEAD' ? await request.text() : undefined,
    })
    return new Response(response.body, {
      status: response.status,
      statusText: response.statusText,
      headers: response.headers,
    })
  }
  return NextResponse.next()
}
