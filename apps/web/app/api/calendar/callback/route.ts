import { type NextRequest, NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { resolveOrigin } from "@/lib/origin";
import { getProvider } from "@/lib/calendar/registry";
import { saveConnection } from "@/lib/db/calendar";
import {
  STATE_COOKIE,
  TZ_COOKIE,
  VERIFIER_COOKIE,
  safeEqual,
} from "@/lib/calendar/oauth";

/**
 * Google Calendar OAuth callback (v1 feature 3). Session-protected (NOT public):
 * the user's first-party session cookie rides this request, so the exchanged
 * tokens are scoped to the right user. Verifies the one-time state, exchanges
 * the code (PKCE), and persists the (encrypted) tokens. Never logs code/tokens.
 */
export const runtime = "nodejs";

export async function GET(request: NextRequest): Promise<Response> {
  const origin = resolveOrigin();

  const back = (query: string) => {
    const res = NextResponse.redirect(`${origin}/settings/calendar${query}`);
    res.cookies.delete(STATE_COOKIE);
    res.cookies.delete(VERIFIER_COOKIE);
    res.cookies.delete(TZ_COOKIE);
    return res;
  };

  const user = await getUser();
  if (!user) return NextResponse.redirect(`${origin}/login`);

  const sp = request.nextUrl.searchParams;
  if (sp.get("error")) return back("?error=denied");

  const code = sp.get("code");
  const state = sp.get("state");
  const expectedState = request.cookies.get(STATE_COOKIE)?.value;
  const verifier = request.cookies.get(VERIFIER_COOKIE)?.value;
  const tz = request.cookies.get(TZ_COOKIE)?.value ?? null;

  if (
    !code ||
    !state ||
    !expectedState ||
    !verifier ||
    !safeEqual(state, expectedState)
  ) {
    return back("?error=state");
  }

  try {
    const tokens = await getProvider("google").exchangeCode({
      code,
      redirectUri: `${origin}/api/calendar/callback`,
      codeVerifier: verifier,
    });
    await saveConnection({ provider: "google", tokens, timezone: tz });
    return back("?connected=1");
  } catch {
    return back("?error=exchange");
  }
}
