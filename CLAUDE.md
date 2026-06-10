# Second Brain / Secretary — Agent Instructions

A personal "secretary" app: capture notes by text, auto-sort them by project, manage
recurring tasks, surface a daily brief. A constrained intent-router, NOT a general chatbot.

## Source of truth — read these, follow them, do not contradict them
@BUILD_SPEC.md
@second_brain_schema_v3.sql

If anything here conflicts with the spec, the spec wins. If the spec is silent or ambiguous,
ASK — do not invent a direction.

## How to work (non-negotiable process)
- Build **one ship-order step at a time** (BUILD_SPEC §12). Do not jump ahead.
- **Plan before coding.** Propose the plan for the current step and wait for approval.
- **Only touch files in scope** for the current step. Do not refactor unrelated code or
  "improve" things I didn't ask for. Narrow > broad.
- **Commit after each working step**, small and labeled, so changes can be rolled back.
- After finishing a step, STOP and summarize what changed; wait before starting the next.

## Hard invariants (never violate, never weaken)
- **Tenancy:** every query against a tenant table filters by `org_id`. RLS is enabled on
  every tenant table (areas, projects, record_types, records, recurrences, tasks, notes,
  captures, attachments, receipts, links, prompts, briefs_log). NEVER disable, bypass,
  loosen, or `USING (true)` an RLS policy. If a query seems to "need" that, you have a bug —
  surface it, don't work around it.
- **Capture never blocks and never loses data:** write the `captures` row synchronously and
  return success immediately; classify async; on any LLM failure or low confidence, file the
  item as an **unsorted note** (`project_id NULL`) so it lands in the Inbox.
- **Markdown only** for note bodies in v0.5. Do NOT build a rich-text/block editor.
- **Daily brief is delivered by EMAIL** (cron). Do NOT add web push, APNs, or service workers.
- **Secrets** live in env vars only. Never commit keys, tokens, or `.env`. Never put real
  user data, PII, or secrets in this file or in fixtures.

## Scope — v0.5 only. Do NOT build these (they are deferred):
voice capture/transcription · receipt OCR · the debrief question engine · discrepancy
detection · completion-anchored recurrence (fixed-frequency only for now) · records
boards/Kanban · push notifications · iPhone widget · messaging / Slack / Teams / Outlook ·
shared orgs / collaboration / RBAC / multi-tenant onboarding.
If a task seems to call for one of these, stop and ask — it's almost certainly out of scope.

## Stack (already decided — do not substitute)
- Next.js (App Router, TypeScript) on Vercel.
- Supabase: Postgres, Auth (magic link), Row-Level Security, Storage (private buckets +
  signed URLs for attachments/receipts — never a public bucket), cron (pg_cron / Edge Functions).
- Email via a transactional provider (Resend or Postmark) for the daily brief.
- `users.id` equals the Supabase `auth.users` id; on signup a trigger creates the user row +
  a personal organization + a membership.

## The nightly job (BUILD_SPEC §3) is load-bearing — get the order right
1) resurface snoozed/waiting → open  2) materialize FIXED recurrences (14-day horizon)
3) roll over unfinished tasks (+`rollover_count`)  4) generate rollover-nudge prompts
5) pre-generate + EMAIL the daily brief  6) cleanup orphaned links/attachments.
Completion-anchored recurrence is NOT handled here and is NOT in v0.5.

## Stop and ask for human verification before considering these "done"
- Auth + the signup→org→membership trigger.
- RLS isolation: prove user A cannot read user B's rows.
- The nightly job actually running on schedule.
- Backups (`pg_dump`) actually landing in storage; the `/export` endpoint producing a valid zip.
Do not self-certify these. Flag them for me to test manually.

## Style
- TypeScript, no `any` where avoidable. Server-side data access goes through one
  org-scoped query layer, not ad-hoc queries scattered across components.
- Prefer boring, readable code over clever abstractions. This is shipping ASAP.
