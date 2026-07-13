// Public Supabase config, inlined into the JS bundle by Expo at build time
// (EXPO_PUBLIC_ vars — the values, not the .env file, ship in the bundle).
// Fail fast so a missing value surfaces at startup, not as a confusing auth
// error later. Mirrors apps/web/lib/env.ts; names use EXPO_PUBLIC_ (vs web's
// NEXT_PUBLIC_).
function required(name: string, value: string | undefined): string {
  if (!value) {
    throw new Error(
      `Missing ${name}. Copy apps/mobile/.env.example to apps/mobile/.env and fill it in.`,
    );
  }
  return value;
}

export const env = {
  supabaseUrl: required(
    "EXPO_PUBLIC_SUPABASE_URL",
    process.env.EXPO_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "EXPO_PUBLIC_SUPABASE_ANON_KEY",
    process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY,
  ),
  // The web app's origin — where capture/voice/receipt POSTs go (those
  // pipelines must stay server-side). Dev: the Mac's LAN IP running `npm run
  // dev`. Prod: the deployed URL. Trailing slash trimmed so `${apiUrl}/api/...`
  // is clean.
  apiUrl: required(
    "EXPO_PUBLIC_API_URL",
    process.env.EXPO_PUBLIC_API_URL,
  ).replace(/\/+$/, ""),
};
