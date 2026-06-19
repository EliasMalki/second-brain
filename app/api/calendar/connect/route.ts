import { type NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { resolveOrigin } from "@/lib/origin";
import { getProvider } from "@/lib/calendar/registry";
import {
  STATE_COOKIE,
  TZ_COOKIE,
  VERIFIER_COOKIE,
  pkceChallenge,
  randomUrlToken,
} from "@/lib/calendar/oauth";

/**
 * Start the Google Calendar OAuth flow (v1 feature 3). Generates a one-time
 * state + PKCE verifier (stashed in short-lived httpOnly cookies), then
 * redirects to Google's consent screen. The client passes ?tz=<IANA> so the
 * callback can persist the user's timezone.
 *
 * redirect_uri comes from resolveOrigin() — it must byte-match a Google Console
 * "Authorized redirect URI", so connect only works on the canonical prod origin
 * + localhost (NOT preview deploys).
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const origin = resolveOrigin();
  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const tz = request.nextUrl.searchParams.get("tz") ?? "";
  const state = randomUrlToken();
  const verifier = randomUrlToken(48);
  const redirectUri = `${origin}/api/calendar/callback`;

  const googleUrl = getProvider("google").authUrl({
    redirectUri,
    state,
    codeChallenge: pkceChallenge(verifier),
  });

  const res = NextResponse.redirect(googleUrl);
  const opts = {
    httpOnly: true,
    secure: origin.startsWith("https://"),
    sameSite: "lax" as const,
    path: "/",
    maxAge: 600, // 10 min
  };
  res.cookies.set(STATE_COOKIE, state, opts);
  res.cookies.set(VERIFIER_COOKIE, verifier, opts);
  if (tz) res.cookies.set(TZ_COOKIE, tz, opts);
  return res;
}
