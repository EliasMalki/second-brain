/**
 * Typed, fail-fast access to environment variables.
 *
 * Secrets live ONLY in env vars (never committed). This module centralizes
 * reads so a missing var throws loudly at the boundary instead of producing a
 * confusing runtime error deep in the app.
 *
 * NOTE: `NEXT_PUBLIC_*` vars are safe to expose to the browser. The
 * service-role key and other secrets are read from server-only modules.
 */

function required(name: string, value: string | undefined): string {
  if (!value || value.length === 0) {
    throw new Error(`Missing required environment variable: ${name}`);
  }
  return value;
}

/** Browser-safe values (anon key is intended to be public). */
export const publicEnv = {
  supabaseUrl: required(
    "NEXT_PUBLIC_SUPABASE_URL",
    process.env.NEXT_PUBLIC_SUPABASE_URL,
  ),
  supabaseAnonKey: required(
    "NEXT_PUBLIC_SUPABASE_ANON_KEY",
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  ),
};

/**
 * Server-only secrets. Reading any of these from client code will fail because
 * the values are not inlined into the browser bundle — keep usage server-side.
 */
export const serverEnv = {
  supabaseServiceRoleKey: () =>
    required(
      "SUPABASE_SERVICE_ROLE_KEY",
      process.env.SUPABASE_SERVICE_ROLE_KEY,
    ),
  resendApiKey: () => required("RESEND_API_KEY", process.env.RESEND_API_KEY),
  anthropicApiKey: () =>
    required("ANTHROPIC_API_KEY", process.env.ANTHROPIC_API_KEY),
  // OpenAI powers voice transcription (the classifier still uses Anthropic).
  openaiApiKey: () => required("OPENAI_API_KEY", process.env.OPENAI_API_KEY),
  // Transcription model is a config value so it can be swapped to
  // 'gpt-4o-transcribe' (better vocabulary) with no code change. Default to the
  // cheaper mini tier.
  transcriptionModel: () =>
    process.env.TRANSCRIPTION_MODEL?.trim() || "gpt-4o-mini-transcribe",
  // Receipt OCR vision model — swappable to 'gpt-4o' if 'gpt-4o-mini' misreads
  // real receipts, with no code change. Default to the cheaper mini tier.
  receiptVisionModel: () =>
    process.env.RECEIPT_VISION_MODEL?.trim() || "gpt-4o-mini",
  // Google Calendar OAuth (read-only) — confidential web client.
  googleClientId: () =>
    required("GOOGLE_CLIENT_ID", process.env.GOOGLE_CLIENT_ID),
  googleClientSecret: () =>
    required("GOOGLE_CLIENT_SECRET", process.env.GOOGLE_CLIENT_SECRET),
  // 32-byte AES-256-GCM key (base64) for encrypting stored calendar tokens at
  // the app layer. Rotating it orphans stored tokens (forces one reconnect).
  calendarTokenKey: () =>
    required("CALENDAR_TOKEN_KEY", process.env.CALENDAR_TOKEN_KEY),
};
