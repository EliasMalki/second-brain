# Build Spec — Second Brain / Secretary (v0.5)

> Purpose: an executable plan to ship with Claude Code. Every item traces to a finding
> in the executive review (referenced as **[F#]**). The v3 schema stays as-is; this cuts
> what gets **built**, not what gets stored.

---

## 0. Scope decision (the headline) — [F1]

Build the **v0.5 cut**, not the sprawling "v1." Keep the full v3 schema (empty tables are free).

**In scope (build now):** auth · projects · tasks · notes · text capture with async LLM filing ·
daily + weekly views · Inbox · fixed recurrences + the nightly job · daily brief **by email** ·
offline capture queue · export · backups · records *minimal UI* (list + stage dropdown) ·
receipts *manual entry*.

**Deferred (do NOT build in v0.5):** voice capture/transcription · receipt OCR · the debrief
question engine · discrepancy detection · completion-anchored recurrence · records boards/Kanban ·
rich-text beyond markdown · web/native push · iPhone widget · messaging + Slack/Teams/Outlook ·
shared orgs / collaboration / RBAC / multi-tenant onboarding.

---

## 1. Stack — decided, stop deciding — [F7][F8]

**Next.js (App Router) + Supabase + Vercel.**

- **Supabase** collapses four undecided problems into one service: Postgres, **Auth** (magic link),
  **Row-Level Security**, **Storage** (attachments/receipts via signed URLs), and **cron** (pg_cron /
  Edge Functions). Do not hand-roll auth or sessions.
- **Vercel** for the Next.js app + API routes.
- If you are genuinely faster in another stack you own, the only non-negotiables are: managed
  Postgres, real auth, RLS-style isolation, private file storage, and a scheduler.

---

## 2. Schema deltas from v3 (the only DB changes)

Everything else in `second_brain_schema_v3.sql` stays. Apply these:

**2a. Reconcile `users` with Supabase auth — [F7]**
Supabase owns identity in `auth.users`. Make the app `users` row a profile keyed to it:
```sql
-- users.id IS the Supabase auth uid
ALTER TABLE users
  ADD CONSTRAINT users_id_is_auth_uid
  FOREIGN KEY (id) REFERENCES auth.users(id) ON DELETE CASCADE;
-- onboarding trigger: on auth signup -> create users row + personal org + membership
```

**2b. Unified search — tasks were missing it — [F11]**
```sql
ALTER TABLE tasks ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (to_tsvector('english',
    coalesce(title,'') || ' ' || coalesce(body,''))) STORED;
CREATE INDEX tasks_search_idx ON tasks USING gin (search_vector);
-- search the brain = notes.search_vector UNION tasks.search_vector
```

**2c. RLS — the isolation that makes multi-user safe — [F7]**
Enable RLS on every tenant table; policy template (repeat per table):
```sql
ALTER TABLE projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON projects
  USING (org_id IN (SELECT org_id FROM memberships WHERE user_id = auth.uid()));
```
Do this for: areas, projects, record_types, records, recurrences, tasks, notes,
captures, attachments, receipts, links, prompts, briefs_log. **Verify it before any friend logs in.**

**2d. Storage — [F8]** `attachments.file_url` and receipt images → Supabase Storage, **private bucket,
signed URLs only**. Never a public bucket.

No other schema changes. `content_format='richtext'` stays as a dormant placeholder — build
markdown only **[F17]**. `areas` stays — harmless **[F15]**.

---

## 3. The nightly job (the secretary's heartbeat) — ordered — [F9][F6][F16]

This one cron is load-bearing; half the features silently fail without it. Run in this order:

1. **Resurface** snoozed tasks where `snooze_until <= today` and waiting tasks where `follow_up_on <= today` → set back to `open`.
2. **Materialize fixed recurrences** only (`anchor='fixed'`) up to a 14-day horizon; advance `last_materialized_through`. **[F6] Completion-anchored rules are NOT touched here** — they spawn their next instance on completion (see §4), not on a horizon. Two code paths, explicitly separated.
3. **Roll over** unfinished tasks scheduled before today → `scheduled_for = today`, `rollover_count += 1`.
4. **Generate prompts**: rollover nudges (e.g. `rollover_count >= 5`). *(Debrief/discrepancy prompts are deferred — engine not built in v0.5.)*
5. **Pre-generate today's daily brief**, insert into `briefs_log`, and **email it** (see §5).
6. **Cleanup**: delete `links`/`attachments` whose polymorphic target no longer exists (no FK integrity on those by design).

---

## 4. Capture pipeline — never blocks, never loses a thought — [F12]

1. Write the `captures` row **synchronously**, return success to the user immediately.
2. Classify **async** (queue/Edge Function) → create note and/or task/receipt, route to project/record, store the LLM `interpretation` on the capture.
3. **On any LLM failure or low confidence:** file as an **unsorted note** (`project_id NULL`) so it lands in the Inbox. Capture is never lost; classification is best-effort.
4. Completion-anchored recurrence hook: when a task with a `completion`-anchored `recurrence_id` is marked done, spawn the next instance dated from `completed_at`.

---

## 5. Daily brief by EMAIL — restores the core value prop — [F2]

The founding problem was the slow-moment scroll; the fix was an **unprompted** nudge. The first-open-of-day
brief waits to be opened — it does **not** solve that. Email does, for ~half a day:

- Nightly cron (step 5 above) renders the brief and sends it via Supabase + an email provider (Resend/Postmark).
- Same content as the in-app Today view: A-priority items + quick wins, time-aware, paused projects excluded.
- Keep the in-app first-open brief too; email is the push channel you get for free from having auth.

---

## 6. Offline capture queue — [F3]

No sync engine, no CRDTs. Just protect capture:
- Capture writes land in **IndexedDB** first, then POST; retry on reconnect.
- Views serve **last-cached** data read-only when offline, with a clear "offline" indicator.
- This covers ~95% of the field-use risk (garage, site, driving) for ~20% of the effort.

---

## 7. Backup & export — it's someone's whole brain — [F4]

- **Nightly `pg_dump`** to object storage, retained. (Supabase has automated backups — confirm the tier and add your own dump for portability.)
- **`/export` endpoint**: one click → zip of all notes as markdown + all structured data as JSON.
  Doubles as the user's trust/lock-in answer.

---

## 8. Auth & the data boundary — read before onboarding anyone — [F5]

- Magic-link auth via Supabase. Per-user personal org created on signup (onboarding trigger, §2a).
- **RLS verified** (test: user A cannot read user B's rows) before a second human logs in.
- **LLM/PII boundary:** every capture is sent to a third-party LLM. Fine for your own notes.
- **Hard rule for v0.5:** friends use it **personally only.** Do **NOT** load the citizenship
  consultancy's client data (passport scans, filings) until RLS is verified, storage is private +
  signed, backups exist, and you've decided what does/doesn't go to the LLM. Write that decision down.

---

## 9. Inbox = one mechanism — [F10]

Two overlapping "needs input" paths existed (`captures.status='needs_clarification'` and `prompts`).
Reconcile: a needs-clarification capture **always creates a prompt**. The Inbox reads exactly two
sources: **unfiled notes** (`project_id IS NULL`) + **pending prompts** (`surface_after <= now()`).

---

## 10. Records — minimal in v0.5

- A project optionally has one `record_type` (user-named: Car / Client / Job) with a stage list + intake checklist.
- UI: a **list of records + a stage dropdown**. No board/Kanban in v0.5.
- Creating a record runs its `intake_checklist` → one task per item (reuses the materializer write path).
- Receipts: **manual entry** (amount/vendor/date), attach photo optionally. OCR deferred.
- Per-record P&L = `SELECT sum(amount) FROM receipts WHERE record_id = $r`.

---

## 11. Closed loops (decisions, not open threads)

- **Build vs buy — [F14]:** closed → build. The records + per-record-P&L direction is not off-the-shelf.
- **iPhone widget — [F13]:** explicitly **v2**. Not dropped silently — deferred on purpose.
- **Rich text — [F17]:** markdown only in v0.5.
- **Push — [F2]:** replaced by email for v0.5; web/native push is v2.

---

## 12. Ship order — ~3 weeks with Claude Code

**Week 1 — foundation.** Supabase project + v3 schema + §2 deltas + RLS. Magic-link auth +
onboarding trigger (user → personal org → membership). CRUD for projects/notes/tasks. Text capture box.
Manual filing. Today + Week views.

**Week 2 — the brain.** Async LLM classifier (§4) with unsorted-note fallback. Inbox (unified, §9).
Fixed recurrences + the nightly job (§3). Daily brief view **+ email** (§5). Export endpoint (§7).
Offline capture queue (§6). Nightly `pg_dump`.

**Week 3 — records + polish.** Records minimal UI (§10). Receipts manual entry. Unified search (§2b).
Polish. Verify RLS. Onboard friends **personally**.

**After validation (v1+):** voice, receipt OCR, debrief engine, completion-anchored recurrence,
records boards, push, widget — then the v2 messaging/collaboration/SaaS track.

---

### One-line summary
Schema is ready and good. Cut the *build* to v0.5, put the brief on email, protect capture
(offline queue) and data (backups + export + RLS), keep friends on personal data only, and ship in three weeks.
