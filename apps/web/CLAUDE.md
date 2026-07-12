# apps/web — Next.js App Instructions

The web app. Root `CLAUDE.md` holds the identity, hard invariants, process, and scope
rules — they all apply here. This file adds the web-specific conventions.

## Architecture conventions (what the code actually does — keep doing it)
- **Server-first.** Pages under `app/(app)/` are async Server Components that fetch via
  `@/lib/db/*` and pass plain data as props to `"use client"` workspace components
  (`tasks-workspace`, `inbox-workspace`, `calendar-workspace`, …).
- **Mutations are Server Actions** (`*/actions.ts`, `"use server"`) that call `@/lib/db/*`
  then `revalidatePath(...)`. Route handlers (`app/api/*`) exist only where actions don't
  fit: multipart uploads (receipts, voice), the capture/interpret endpoints, OAuth
  redirect/callback, and the token-guarded internal endpoint for the nightly job.
- **`lib/db/*` files are THIN ADAPTERS** over `@second-brain/shared/db/*`: they resolve
  `createClient()` (cookie-backed anon client) + `getCurrentOrgId()` + `requireUser()` and
  delegate. Do NOT put query logic in them — new queries go in `packages/shared` (DI form),
  then get a one-line adapter here. Platform-bound flows (capture write pipeline, receipt
  create/upload, voice transcription, calendar OAuth/crypto, LLM commands) stay in this app.
- The browser Supabase client (`lib/supabase/client.ts`) is intentionally unused — no
  client component talks to Supabase directly.
- The offline capture queue: `lib/offline/queue.ts` is the IndexedDB storage impl behind
  the shared `CaptureQueueStorage` interface; flush/retry logic lives in shared. The
  component (capture-box) drives WHEN to flush (mount / `online` event / after enqueue).

## Design system
- **No Tailwind.** All styling is hand-written CSS in `app/globals.css` (~8k lines):
  design tokens as CSS custom properties on `:root` (short names `--bg/--fg/--accent/
  --space-*` plus verbose `--color-*` aliases), light/dark theme blocks, and component
  rules. New UI reuses existing tokens/classes; don't invent parallel token names.
- Fonts: Geist (`geist` package, `--font-geist-sans`). Icons: Tabler webfont
  (`@tabler/icons-webfont`, `ti ti-*` classes).
- **Priority chips (A/B/C/D) are the only saturated color** (root invariant). Project
  color stays quiet — tints, dots, thin edges via the per-project `--proj` variable.
- Hairlines are 0.5px borders (the "apple pass" look); press states, two-step Done on
  touch, and swipe physics come from `lib/motion.ts` + `lib/haptics.ts` — reuse them.

## Component reuse (don't rebuild these)
- Tasks composer / quick-add (`app/(app)/tasks/quick-add-task.tsx`, ComposerDock) and the
  task detail panel (`app/(app)/tasks/task-panel.tsx`) are THE editing surfaces for tasks —
  new features reuse them (the Calendar view already does).
- Done pill + inline undo: `done-pill.tsx` (DonePill, RowUndo) + `use-row-completion.ts`
  + `undo-toast.tsx`. Any new "complete something" UI goes through this pattern.
- Quick-date buttons resolve via shared `domain/dates` (`todayISO`, `addDaysISO`,
  `endOfWeekISO`; "No date" = null) — never hand-roll date math.

## Web-specific facts
- Env lives in `apps/web/.env.local` (Next loads it from the app dir). Ops scripts run
  from the REPO ROOT with `node --env-file=apps/web/.env.local scripts/<name>.mjs`.
- Vercel deploys this app with Root Directory = `apps/web` (install runs at the repo
  root via the root lockfile). `next.config.mjs` sets `transpilePackages` for
  `@second-brain/shared` and `outputFileTracingRoot` to the repo root — keep both.
- `middleware.ts` (session refresh + route gating) must stay at the app root.
- Auth: magic link + password (`app/login/`); friend accounts via
  `scripts/create-account.mjs` (`<username>@sb.test` convention — keep in sync with
  `TEST_EMAIL_DOMAIN` in `app/login/actions.ts`).
