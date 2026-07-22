import { NextResponse, type NextRequest } from "next/server";
import { SESSION_COOKIE } from "@/lib/auth/constants";

// Public paths that never require a session. The scheduled Garmin sync is
// session-less by design — its route enforces the CRON_SECRET header itself.
const PUBLIC_PREFIXES = ["/login", "/register", "/api/auth", "/api/garmin/sync-all"];

// Next 16's request-interception convention (formerly `middleware`).
export function proxy(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const hasSession = Boolean(req.cookies.get(SESSION_COOKIE)?.value);
  const isPublic = PUBLIC_PREFIXES.some((p) => pathname === p || pathname.startsWith(`${p}/`));

  // Signed-in users shouldn't see the auth screens.
  if (hasSession && (pathname === "/login" || pathname === "/register")) {
    return NextResponse.redirect(new URL("/", req.url));
  }

  // Gate everything else on a session cookie (full validation happens server-side).
  if (!hasSession && !isPublic) {
    const url = new URL("/login", req.url);
    if (pathname !== "/") url.searchParams.set("next", pathname);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  // Skip Next internals, static assets, and PWA/TWA files (service worker,
  // icons, Android asset links, the downloadable APK).
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|icon.svg|manifest.webmanifest|sw.js|icons/|\\.well-known/|runplan.apk).*)",
  ],
};
