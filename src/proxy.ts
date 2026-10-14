import { NextRequest, NextResponse } from "next/server";

export function proxy(request: NextRequest) {
  const nonce = Buffer.from(crypto.randomUUID()).toString("base64");
  const development = process.env.NODE_ENV !== "production";
  const csp = [
    "default-src 'none'",
    `script-src 'self' 'nonce-${nonce}' https://challenges.cloudflare.com${development ? " 'unsafe-eval'" : ""}`,
    "style-src 'self' 'unsafe-inline'",
    `connect-src 'self' https://challenges.cloudflare.com${development ? " ws: wss:" : ""}`,
    "frame-src https://challenges.cloudflare.com",
    "img-src 'self' data: blob:",
    "font-src 'self'",
    "worker-src 'self'",
    "manifest-src 'self'",
    "base-uri 'none'",
    "object-src 'none'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join("; ");
  const headers = new Headers(request.headers);
  headers.set("x-nonce", nonce);
  headers.set("Content-Security-Policy", csp);
  const response = NextResponse.next({ request: { headers } });
  response.headers.set("Content-Security-Policy", csp);
  return response;
}
export const config = {
  matcher: [
    "/((?!api|_next/static|_next/image|sw.js|manifest.webmanifest|icon.svg|robots.txt).*)",
  ],
};
