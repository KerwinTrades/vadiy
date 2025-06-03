import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

export function middleware(request: NextRequest) {
  // Clone the request headers
  const requestHeaders = new Headers(request.headers);

  // Create response
  const response = NextResponse.next({
    request: {
      headers: requestHeaders,
    },
  });

  // Remove X-Frame-Options to allow embedding
  response.headers.delete('X-Frame-Options');
  
  // Set Content Security Policy to allow specific domains
  response.headers.set(
    'Content-Security-Policy',
    "frame-ancestors 'self' https://*.softr.app https://vadiy.com https://*.vadiy.com http://localhost:* https://*.softr.io;"
  );

  // Add CORS headers for embed routes
  if (request.nextUrl.pathname.startsWith('/embed')) {
    response.headers.set('Access-Control-Allow-Origin', '*');
    response.headers.set('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    response.headers.set('Access-Control-Allow-Headers', 'Content-Type');
  }

  return response;
}

// Apply middleware only to embed routes to minimize performance impact
export const config = {
  matcher: ['/embed/:path*', '/api/chat/:path*']
};
