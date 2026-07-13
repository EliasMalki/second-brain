# apps/mobile — React Native / Expo App Instructions

The iOS-first mobile app (Phase 2 of the mobile plan). Root `CLAUDE.md` holds the
product identity, hard invariants, and scope rules — they all apply here. This
file adds the mobile-specific conventions. Stack: **Expo SDK 57 (managed) +
TypeScript + Expo Router + NativeWind 4**. Read the versioned Expo docs
(https://docs.expo.dev/versions/v57.0.0/) — Expo changes fast.

## SCOPE FENCE — Phase 2 builds FIVE screens, nothing else
Build ONLY: **capture · today/brief · tasks · inbox · calendar** (agenda view).
Explicitly **NOT** in Phase 2 — these are Phase 3, do not build them here:
records Kanban · the notes editor · the projects grid · push notifications ·
home-screen widget · the share sheet. If a task seems to need one of these, stop
and ask. Build one screen per session, plan-first, commit per step, and STOP at
each step's verification to wait for the user.

## The hard rule: consume `@second-brain/shared`, never reimplement
All queries, types, domain logic, and the capture API come from
`@second-brain/shared` (imported via its subpath exports, e.g.
`@second-brain/shared/db/tasks`, `.../domain/dates`, `.../offline/queue`). If a
query or rule is missing, add it THERE in DI form `(db, orgId, …)` and consume
it — a copy of business logic in this app is a bug. If web and mobile ever
disagree on behavior, the fix is to move the logic into shared, not to duplicate
it. Every query stays org_id-scoped (shared enforces it); never bypass it, never
touch RLS.

## RN conventions
- **44px minimum touch targets** (buttons use `h-11`).
- **Safe areas** everywhere: `SafeAreaView` / `useSafeAreaInsets` from
  `react-native-safe-area-context` (wired in the root layout via `SafeAreaProvider`).
- **No hover states** — a touch device has no hover. Every control's RESTING
  state must be legible (visible border/fill), not revealed on interaction.
- **Optimistic updates** for every mutation; reconcile on the server response.
- **Dark mode is system-following**, on from the start (`userInterfaceStyle:
  automatic`). Never hardcode a theme.

## Design language (match web)
- Calm, neutral surfaces. Tokens mirror `apps/web/app/globals.css`, defined as
  CSS variables in `src/global.css` (light `:root` + a
  `@media(prefers-color-scheme: dark)` override) and exposed as NativeWind
  classes via `tailwind.config.js` — use `bg-bg`, `text-fg`, `border-border`,
  etc. One class follows the system theme; no `dark:` variants.
- **Priority chips A–D are the ONLY saturated color** (`prio-a-*`, `prio-b-*`;
  C/D stay neutral). `accent` is monochrome. **Project colors stay quiet** —
  dots, thin edges, pale tags, never a filled surface.
- **Completion = the Done pill + inline-undo pattern** (strikethrough + Undo on
  the row, ~5s grace before the server write — same mechanic as web's
  `use-row-completion`/`done-pill`). Any "complete something" UI uses it.
- Type is **SF Pro (system)** — no font loading (web already falls back to
  `-apple-system` on Apple hardware, so this matches how web renders on iPhone).

## Layout & routing
- Routes live in `src/app/` (Expo Router, file-based); everything else in
  `src/lib/` and `src/components/`. `@/*` → `src/*`.
- `app/_layout.tsx` is the provider/splash/deep-link root. `app/(app)/` is the
  auth-gated group (its `_layout` redirects to `/sign-in` when there's no
  session). `app/sign-in.tsx` and `app/auth/callback.tsx` are PUBLIC (outside the
  group) so they stay reachable while signed out.

## Auth & build facts
- One Supabase client (`lib/supabase.ts`) from the shared factory; session in
  **LargeSecureStore** (Keychain AES key + AsyncStorage ciphertext). Sign-out is
  `signOut({ scope: 'local' })` — never revoke the user's web sessions.
- Magic-link deep link target is `AUTH_CALLBACK_URL` in `lib/branding.ts`. It
  MUST stay byte-identical to the web confirm-route allowlist
  (`apps/web/app/auth/confirm/route.ts`) and the Supabase dashboard redirect
  allowlist.
- **A dev build is required — Expo Go will NOT work** (the custom scheme won't
  route there). Free-signing dev builds expire after ~7 days; re-run
  `npx expo run:ios --device` to re-sign. See README for the full run/release flow.
- **Rename procedure** (name is a placeholder): `app.json` `name` + `slug` +
  `scheme` + `ios.bundleIdentifier` → `lib/branding.ts` (`APP_NAME`,
  `AUTH_CALLBACK_URL`) → web `MOBILE_REDIRECT_ALLOWLIST` → Supabase redirect
  allowlist → rebuild the dev client (the scheme is baked into the binary).
- `expo-doctor` flags two things by design: the `disableHierarchicalLookup`
  metro override and the react@18/@19 duplication — both are the intended shape
  of a monorepo where web is React 18 and mobile React 19 (see `metro.config.js`).
