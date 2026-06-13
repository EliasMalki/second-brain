import { createServerClient, type CookieOptions } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import { publicEnv } from "@/lib/env";

/**
 * Refreshes the Supabase session on every request and enforces route access.
 *
 * Two jobs:
 *  1. Keep the auth cookies fresh (the @supabase/ssr pattern) so Server
 *     Components — which can't write cookies — always see a valid session.
 *  2. Gate routes: unauthenticated users are bounced to /login; authenticated
 *     users hitting /login are sent home.
 *
 * Public paths: /login and /auth/* (the magic-link confirm + signout routes).
 */
export async function updateSession(request: NextRequest) {
  let supabaseResponse = NextResponse.next({ request });

  const supabase = createServerClient(
    publicEnv.supabaseUrl,
    publicEnv.supabaseAnonKey,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: {
            name: string;
            value: string;
            options: CookieOptions;
          }[],
        ) {
          cookiesToSet.forEach(({ name, value }) =>
            request.cookies.set(name, value),
          );
          supabaseResponse = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) =>
            supabaseResponse.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // IMPORTANT: getUser() must run immediately after createServerClient with no
  // intervening logic, or session refresh can break in subtle ways.
  const {
    data: { user },
  } = await supabase.auth.getUser();

  const path = request.nextUrl.pathname;
  const isPublic = path.startsWith("/login") || path.startsWith("/auth");

  if (!user && !isPublic) {
    const url = request.nextUrl.clone();
    url.pathname = "/login";
    // Distinguish an expired session (a stale Supabase auth cookie is present
    // but no valid user) from a first-time visitor, so /login can explain why.
    const hadAuthCookie = request.cookies
      .getAll()
      .some((c) => c.name.startsWith("sb-") && c.name.includes("-auth-token"));
    url.search = "";
    if (hadAuthCookie) url.searchParams.set("expired", "1");
    return NextResponse.redirect(url);
  }

  if (user && path.startsWith("/login")) {
    const url = request.nextUrl.clone();
    url.pathname = "/";
    return NextResponse.redirect(url);
  }

  // Return the (possibly cookie-updated) response so refreshed auth cookies
  // reach the browser.
  return supabaseResponse;
}
