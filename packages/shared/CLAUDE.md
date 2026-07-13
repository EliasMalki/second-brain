# packages/shared — @second-brain/shared

The single source of truth for database types, canonical queries, and domain logic.
Consumed by `apps/web` today and by the future mobile app. Root `CLAUDE.md` invariants
all apply here.

## THE HARD RULE: platform-agnostic, no exceptions
- **NO DOM APIs**: no `window`, `document`, `localStorage`, `sessionStorage`,
  `indexedDB`, `navigator`, no `"use client"`.
- **NO Next.js imports** (`next/*`, `@supabase/ssr`, `server-only`, `react` `cache`).
- **NO React Native imports.**
- **No `process.env` reads** — configuration and secrets arrive as function parameters
  from the app. (Env var names are an app convention: `NEXT_PUBLIC_*` vs `EXPO_PUBLIC_*`.)
- Allowed: pure TypeScript, `@supabase/supabase-js`, global `fetch`/`crypto`
  (standard in Node 18+, browsers, and RN), and React hooks that touch NO platform APIs
  (`ui/use-row-completion.ts` is the first, shared by web + mobile; `react` is an
  optional peerDep — don't add speculative ones).
- Anything platform-specific goes behind an **interface this package defines and each app
  implements** — e.g. `CaptureQueueStorage` in `offline/queue.ts` (web: IndexedDB;
  mobile: native storage). The logic stays here; only the storage/transport is per-app.
- Enforcement is mechanical: `tsconfig.json` deliberately has **no `dom` lib**, so DOM
  globals are type errors in this package. Do not add `dom` to `lib`. The repo's
  verification grep (`window|document|localStorage|indexedDB|next/`) must stay clean.

## Conventions
- **Dependency-injected query functions**: every db function takes
  `(db: Db, orgId: string[, ownerId: string], …args)` — it never resolves a client, a
  session, or an org itself. `Db = SupabaseClient<Database>` from `src/supabase.ts`.
  Apps own the resolution (web: cookie client + `getCurrentOrgId()`; mobile later:
  its own session/org source) in thin adapters.
- **Tenancy is explicit**: every query against a tenant table carries
  `.eq("org_id", orgId)` even though RLS also enforces it — belt + suspenders,
  the belt is mandatory (root invariant).
- **Don't duplicate these in an app.** If an app needs a query or domain rule that
  exists here, import it; if it needs a new one, add it HERE (DI form) and write a
  thin adapter in the app. A copy in an app is a bug.
- `src/types/database.ts` is generated (`supabase gen types typescript`) — regenerate,
  never hand-edit.
- Layout: `types/` (generated DB types) · `supabase.ts` (Db + client factory) ·
  `domain/` (dates, tags, priority, buckets, colors — pure functions) · `db/`
  (org-scoped queries) · `capture/` (client API surface) · `offline/` (queue
  contract + driver) · `ui/` (platform-agnostic React hooks).
