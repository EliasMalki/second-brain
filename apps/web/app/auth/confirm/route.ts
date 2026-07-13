import { type EmailOtpType } from "@supabase/supabase-js";
import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";

/**
 * Exact app-scheme redirect targets the mobile app registers. The Magic Link
 * email is one https link shared by web and mobile (Gmail strips custom-scheme
 * hrefs, so the link must be https). When `next` is one of these, we hand the
 * still-unverified token to the app instead of verifying here — the app calls
 * verifyOtp itself, so the one-time token is spent on-device, not by this route.
 *
 * Exact-match only (never a prefix/startsWith): a loose match would let an
 * attacker-controlled `next` receive the token or bounce the browser off-site.
 */
const MOBILE_REDIRECT_ALLOWLIST = new Set(["secondbrain://auth/callback"]);

/**
 * Magic-link landing. The email link (configured in Supabase to use
 * {{ .TokenHash }}) hits this route; verifyOtp exchanges the token for a
 * session, setting auth cookies, then we redirect into the app.
 *
 * On any failure we send the user to the error page rather than leaking detail.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next");

  // Mobile deep link: forward the unconsumed token to the app scheme. The app
  // verifies it, so the one-time token is spent on-device. Built with a manual
  // Location header because the target is a non-http(s) scheme.
  if (token_hash && type && next && MOBILE_REDIRECT_ALLOWLIST.has(next)) {
    const appUrl = new URL(next);
    appUrl.searchParams.set("token_hash", token_hash);
    appUrl.searchParams.set("type", type);
    return new NextResponse(null, {
      status: 302,
      headers: { Location: appUrl.toString() },
    });
  }

  // Web flow: verify here. Sanitize `next` to a same-origin relative path so a
  // crafted link can't turn this into an open redirect (reject absolute URLs
  // and protocol-relative `//host` escapes); default to the app root.
  const safeNext =
    next && next.startsWith("/") && !next.startsWith("//") ? next : "/";

  if (token_hash && type) {
    const supabase = createClient();
    const { error } = await supabase.auth.verifyOtp({ type, token_hash });
    if (!error) {
      return NextResponse.redirect(new URL(safeNext, request.url));
    }
  }

  return NextResponse.redirect(new URL("/auth/auth-code-error", request.url));
}
