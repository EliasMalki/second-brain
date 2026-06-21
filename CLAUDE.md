# Second Brain / Secretary — Agent Instructions

A personal "secretary" app: capture notes/tasks by text and voice, auto-sort them by
project, manage recurring tasks, surface a daily brief. A constrained intent-router,
NOT a general chatbot.

## STATUS
v0.5 is shipped and polished (auth, projects, tasks, notes, capture + async classifier,
Inbox, fixed recurrences, nightly job, email brief, export, offline queue, records minimal
UI, receipts manual entry, search) plus a full UI overhaul. **Now building v1 features.**

## Source of truth — read these, follow them
@BUILD_SPEC.md        # the v0.5 record + schema/architecture rules — STILL BINDING
@second_brain_schema_v3.sql

If anything here conflicts with the spec's architecture rules, the spec wins. If something
is silent or ambiguous, ASK — do not invent a direction.

## How to work (non-negotiable process)
- Build **one v1 feature at a time**, in the build order below. Do not jump ahead.
- **Plan before coding.** Propose the plan for the current feature and wait for approval.
- **Only touch files in scope** for the current feature. No unrelated refactors.
- **Commit after each working step**, small and labeled.
- After finishing a feature, STOP and summarize; wait before starting the next.

## v1 BUILD ORDER (build only the current one)
1. Voice capture (gpt-4o-mini-transcribe, vocabulary steering, rides existing pipeline)
2. Receipt OCR (vision model reads photo → propose fields, user confirms, never auto-save)
3. Google Calendar integration (OAuth read, behind a generic "calendar provider" abstraction
   so Microsoft/Outlook is a clean v2 add — DO NOT hardcode Google-only)
4. Debrief engine + discrepancy detection (rides the prompts/Inbox plumbing; conservative,
   always-dismissible questions; "this looks off — did you mean X?" never a block)
5. Records board / Kanban (records as cards in stage columns; mobile collapses to single col)
6. Telegram capture (the messaging-adapter proving ground — free, fast)
7. WhatsApp capture (same adapter, Business API + verification + templates for the brief)

## Hard invariants (never violate, never weaken)
- **Tenancy:** every query against a tenant table filters by `org_id`. RLS enabled on every
  tenant table. NEVER disable, bypass, loosen, or `USING (true)` an RLS policy.
- **Capture never blocks and never loses data:** write the capture row synchronously, return
  success immediately; classify async; on failure file as an unsorted note in the Inbox.
  This applies to voice and messaging captures too — a failed transcription/classification
  never discards the input.
- **Markdown only** for note bodies. No rich-text/block editor beyond what exists.
- **Daily brief delivered by EMAIL.** No web push / APNs / service workers for notifications.
- **Priority chips (A/B/C/D) are the only saturated color.** Project color stays quiet
  (tints, dots, thin edges).
- **Secrets** in env vars only. Never commit keys/tokens/.env. No real user data/PII in fixtures.
- **Friends use it PERSONALLY only.** Do NOT onboard the citizenship-consultancy's client
  PII (passport scans, filings) until shared-org RLS is verified — that's v2.

## Scope — v1 phase. Do NOT build these (deferred to v2+):
completion-anchored recurrence · Flutter mobile app · shared team orgs / multi-member orgs ·
role-based access control (RBAC) · iPhone home-screen widget · partner task handoff
(assignee_id wiring) · two-way calendar write-back.
If a task seems to require one of these, stop and ask — it's out of scope.

## Stack (already decided — do not substitute)
Next.js (App Router, TypeScript) on Vercel. Supabase (Postgres, Auth, RLS, Storage, cron).
Email via Resend/Postmark. OpenAI for the classifier + transcription. `users.id` = Supabase
`auth.users` id; signup trigger creates user + personal org + membership.

## Stop and ask for human verification before considering these "done"
RLS isolation (user A cannot read user B's data) · the nightly job running on schedule ·
backups landing in storage · any new external integration's OAuth/token handling.
Do not self-certify these.

## Style
TypeScript, avoid `any`. Server-side data access through one org-scoped query layer.
Prefer boring, readable code over clever abstractions.