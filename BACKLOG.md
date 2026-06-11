# Backlog

Deferred work, kept out of the current scope on purpose. See BUILD_SPEC.md for
the full v0.5 plan and the explicit v1+ deferral list.

## Owed from Week 2 (BUILD_SPEC §7, §12)

- **Nightly `pg_dump` backups.** A scheduled job that dumps the whole Postgres
  DB to a private Supabase Storage bucket nightly, retained. The portability /
  disaster-recovery answer alongside the existing `/export` endpoint. Sketch:
  private `backups` bucket → Edge Function that runs `pg_dump` and uploads the
  dump → pg_cron right after the nightly job. CLAUDE.md requires manual
  confirmation that a dump actually lands in the bucket before this is "done".

## Manual verifications still owed (CLAUDE.md — do not self-certify)

- Nightly cron actually firing on schedule (09:00 UTC) — brief email + rollovers.
- Brief email landing in the inbox (Resend; sender is `onboarding@resend.dev`
  until a domain is verified — then set the `BRIEF_FROM_EMAIL` secret).
- Offline capture flow in a real browser (wifi off → capture → wifi on → syncs).
- RLS two-user isolation (user A cannot read user B's rows) before any friend
  logs in. Helper: `scripts/rls-isolation-test.mjs`.
