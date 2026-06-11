-- ============================================================================
--  Nightly job scheduling (BUILD_SPEC §3) — pg_cron + pg_net -> Edge Function
-- ============================================================================
--  Fires daily at 09:00 UTC (~05:00 Toronto in summer) so the brief email
--  lands before the day starts. The function itself is idempotent (horizon
--  watermark, unique briefs_log row, deduped nudges), so a duplicate or
--  manual invocation is harmless.
--
--  Auth note: the call carries the ANON key, which is public by design (it
--  ships in the browser bundle) — committing it here leaks nothing. It passes
--  the function's verify_jwt gate. The service-role key is NOT used here so
--  no secret ever enters version control.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pg_cron WITH SCHEMA pg_catalog;
CREATE EXTENSION IF NOT EXISTS pg_net WITH SCHEMA extensions;

SELECT cron.schedule(
  'nightly-secretary',
  '0 9 * * *',
  $$
  SELECT net.http_post(
    url := 'https://tmpelxqkpgtihycndtuj.supabase.co/functions/v1/nightly',
    headers := jsonb_build_object(
      'Content-Type', 'application/json',
      'Authorization', 'Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InRtcGVseHFrcGd0aWh5Y25kdHVqIiwicm9sZSI6ImFub24iLCJpYXQiOjE3ODExMTY1NTIsImV4cCI6MjA5NjY5MjU1Mn0.wvJtMNCzePP1FuWaM4Oy-PLimvwA4epYhER6-C8A00Q'
    ),
    body := '{}'::jsonb,
    timeout_milliseconds := 120000
  );
  $$
);
