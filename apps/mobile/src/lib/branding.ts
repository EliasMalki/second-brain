// The user-facing app name. Placeholder until the real name is chosen; this is
// the only in-code name reference (app.json holds the identity fields).
export const APP_NAME = "Second Brain";

// Magic-link deep-link target. MUST stay byte-identical across three places:
// this constant, the web confirm-route allowlist (apps/web/app/auth/confirm/
// route.ts MOBILE_REDIRECT_ALLOWLIST), and the Supabase dashboard redirect
// allowlist. Renaming the scheme means updating all three AND rebuilding the
// dev client (the scheme is baked into the native binary).
export const AUTH_CALLBACK_URL = "secondbrain://auth/callback";
