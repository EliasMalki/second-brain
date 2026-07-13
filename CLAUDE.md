# Second Brain / Secretary — Agent Instructions (repo root)

A personal "secretary" app: capture notes/tasks by text and voice, auto-sort them by
project, manage recurring tasks, surface a daily brief. A constrained intent-router,
NOT a general chatbot.

This file holds everything platform-independent. Layered instructions:
- `apps/web/CLAUDE.md` — Next.js app conventions (design tokens, component patterns, web rules)
- `packages/shared/CLAUDE.md` — the platform-agnostic package rules (queries + domain logic)

## STATUS
v0.5 shipped and polished; v1 features 1–4 shipped (voice capture, receipt OCR,
Google Calendar read + in-app calendar view, debrief engine) plus the capture command
interpreter and several UI passes. **Repo is now a monorepo** (Phase 1 of mobile prep):
the web app lives in `apps/web`, platform-agnostic logic in `packages/shared`.
**Phase 2 (React Native/Expo app) is underway in `apps/mobile`:** Step 1 (scaffold +
magic-link auth with deep linking) is built; Steps 2–7 (the five screens, then EAS/
TestFlight) come one at a time. See `apps/mobile/CLAUDE.md` for its scope fence.

## Source of truth — read these, follow them
@BUILD_SPEC.md        # the v0.5 record + schema/architecture rules — STILL BINDING
@second_brain_schema_v3.sql

If anything here conflicts with the spec's architecture rules, the spec wins. If something
is silent or ambiguous, ASK — do not invent a direction.

## Monorepo map
```
apps/web/          the Next.js app (Vercel deploys from here — Root Directory = apps/web)
apps/mobile/       the Expo (iOS-first) app — Phase 2, consumes @second-brain/shared
packages/shared/   @second-brain/shared — Supabase types, canonical queries, domain logic
supabase/          migrations + Deno edge functions (nightly, classify-capture, debrief, …)
scripts/           ops scripts (run from repo root: node --env-file=apps/web/.env.local scripts/…)
```
npm workspaces. Root scripts delegate: `npm run dev|build|lint` → web; `npm run typecheck` → all.

## How to work (non-negotiable process)
- Build **one v1 feature at a time**, in the build order below. Do not jump ahead.
- **Plan before coding.** Propose the plan for the current feature and wait for approval.
- **Only touch files in scope** for the current feature. No unrelated refactors.
- **Commit after each working step**, small and labeled.
- After finishing a feature, STOP and summarize; wait before starting the next.

## v1 BUILD ORDER (build only the current one)
1. ~~Voice capture~~ (shipped)
2. ~~Receipt OCR~~ (shipped)
3. ~~Google Calendar integration~~ (shipped — read-only, behind a generic "calendar
   provider" abstraction so Microsoft/Outlook is a clean v2 add — DO NOT hardcode Google-only)
4. ~~Debrief engine + discrepancy detection~~ (shipped)
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
- **Secrets** in env vars only. Never commit keys/tokens/.env. Per-user OAuth tokens are
  stored DB-encrypted (AES-256-GCM, key in env) behind RLS. No real user data/PII in fixtures.
- **Friends use it PERSONALLY only.** Do NOT onboard the citizenship-consultancy's client
  PII (passport scans, filings) until shared-org RLS is verified — that's v2.

## Scope — v1 phase. Do NOT build these (deferred to v2+):
completion-anchored recurrence · shared team orgs / multi-member orgs · role-based access
control (RBAC) · iPhone home-screen widget · partner task handoff (assignee_id wiring) ·
two-way calendar write-back. The mobile app itself is a later phase — Phase 1 only prepared
the repo for it. If a task seems to require one of these, stop and ask — it's out of scope.

## Stack (already decided — do not substitute)
Next.js (App Router, TypeScript) on Vercel (`apps/web`). Supabase (Postgres, Auth, RLS,
Storage, cron). Email via Resend. OpenAI for transcription/OCR; Anthropic for the
classifier/interpreter. npm workspaces. `users.id` = Supabase `auth.users` id; signup
trigger creates user + personal org + membership.

## Stop and ask for human verification before considering these "done"
RLS isolation (user A cannot read user B's data) · the nightly job running on schedule ·
backups landing in storage · any new external integration's OAuth/token handling.
Do not self-certify these.

## Style
TypeScript, avoid `any`. Server-side data access through the org-scoped query layer:
canonical queries live in `packages/shared` (DI form), `apps/web/lib/db/*` are thin
request-context adapters. Prefer boring, readable code over clever abstractions.
