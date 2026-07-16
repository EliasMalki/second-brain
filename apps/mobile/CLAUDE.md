# apps/mobile — React Native / Expo App Instructions

The iOS-first mobile app (Phase 2 of the mobile plan). Root `CLAUDE.md` holds the
product identity, hard invariants, and scope rules — they all apply here. This
file adds the mobile-specific conventions. Stack: **Expo SDK 57 (managed) +
TypeScript + Expo Router + NativeWind 4**. Read the versioned Expo docs
(https://docs.expo.dev/versions/v57.0.0/) — Expo changes fast.

## SCOPE FENCE — built so far, and what's still fenced off
BUILT: **capture · today/brief · tasks · inbox · calendar** (agenda) · **Notes**
(Phase 2A — home → 2-col card grid → editor; drawer order is
Home · Tasks · Inbox · **Notes** · Calendar). The Notes editor is the SHARED
`@second-brain/editor` core hosted in an Expo DOM component (`"use dom"`,
`src/components/note-editor-dom.tsx`) — NO native rebuild; NEVER fork a
mobile-only editor. Note reads/writes go direct (shared `db/notes` DI queries),
like tasks — only the capture pipeline POSTs to web routes.
Explicitly **NOT** built (later phases — do not build without asking):
records Kanban · the projects grid · push notifications · home-screen widget ·
the share sheet · inline images/attachments in the editor. Build one screen/step
per session, plan-first, commit per step, and STOP at each step's verification.

## The hard rule: consume `@second-brain/shared`, never reimplement
All queries, types, domain logic, and the capture API come from
`@second-brain/shared` (imported via its subpath exports, e.g.
`@second-brain/shared/db/tasks`, `.../domain/dates`, `.../offline/queue`). If a
query or rule is missing, add it THERE in DI form `(db, orgId, …)` and consume
it — a copy of business logic in this app is a bug. If web and mobile ever
disagree on behavior, the fix is to move the logic into shared, not to duplicate
it. Every query stays org_id-scoped (shared enforces it); never bypass it, never
touch RLS.

**Reads go direct; capture WRITES go through the web routes.** Reads run shared
DI queries straight against Supabase with the app's JWT (RLS-scoped). But the
capture pipelines (`/api/capture`, `/api/capture/voice`, `/api/receipts/*`) must
stay server-side — they hold the service-role classifier invoke and the OpenAI
transcription/OCR keys, which never ship on-device. The app POSTs to them at
`EXPO_PUBLIC_API_URL` with a Bearer token (`lib/api.ts`); the routes bridge
cookie-or-bearer auth via `apps/web/lib/api-auth.ts`. See README → Capture backend.

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
- Calm, neutral surfaces. Tokens are **GENERATED** from
  `packages/shared/src/design/tokens.ts` (the single source web and mobile
  share) via `npm run tokens` at the repo root — it rewrites the marker-fenced
  block in `src/global.css` (light `:root` + a `@media(prefers-color-scheme:
  dark)` override) and `tailwind-preset.generated.js`. NEVER hand-edit between
  the markers or add colors/radii to `tailwind.config.js` — change tokens.ts
  and regenerate (`npm run tokens:check` gates root typecheck). Use `bg-bg`,
  `text-fg`, `border-border`, etc. One class follows the (possibly
  user-overridden) theme; no `dark:` variants. RN style props that can't take
  CSS vars (drawer panel, scrims) read `tokenColor()` from the same module.
- **Priority chips A–D are the ONLY saturated color** (`prio-a-*`, `prio-b-*`;
  C/D stay neutral). `accent` is monochrome. **Project colors stay quiet** —
  dots, thin edges, pale tags, never a filled surface.
- **Completion = the Done pill + inline-undo pattern** (strikethrough + Undo on
  the row, ~5s grace before the server write — same mechanic as web's
  `use-row-completion`/`done-pill`). Any "complete something" UI uses it.
- Type is **Geist** (web's actual face), embedded natively via the expo-font
  config plugin (Regular/Medium/SemiBold/Bold vendored in `assets/fonts/` from
  the `geist` npm package, OFL license alongside). RN has no style inheritance,
  so the default is applied by the base components `@/components/ui/text` and
  `ui/text-input` — ALWAYS import Text/TextInput from there, never from
  react-native (ESLint enforces it). Weight classes (`font-medium/semibold/
  bold`) swap the Geist face directly (iOS family names are per-weight).
  Changing fonts requires a dev-client rebuild.
- **Borders are true hairlines** — the generated preset sets the default
  border width to `hairlineWidth()`, matching web's 0.5px "apple pass" look;
  plain `border`/`border-t` classes are hairline everywhere.

## Layout & routing
- Routes live in `src/app/` (Expo Router, file-based); everything else in
  `src/lib/` and `src/components/`. `@/*` → `src/*`.
- **Navigation is a LEFT DRAWER (`expo-router/drawer`) — NO tab bar.** The drawer
  (hamburger in each screen's `ScreenHeader` + left-edge swipe) mirrors web's
  sidebar; the landing screen is `index` = Home/Today (the brief). Do not
  reintroduce tabs.
- `app/_layout.tsx` is the provider/splash/deep-link root. `app/(app)/` is the
  auth-gated group (its `_layout` redirects to `/sign-in` when there's no
  session). `app/sign-in.tsx` and `app/auth/callback.tsx` are PUBLIC (outside the
  group) so they stay reachable while signed out.
- **Notes is the one nested Stack** (`app/(app)/notes/_layout.tsx`, `headerShown:false`):
  index → list → [id]. Its `Drawer.Screen` sets `swipeEnabled:false` so the stack's
  iOS back-swipe owns the left edge on deeper screens (the hamburger still opens the
  drawer). The editor screen ([id]) rolls its own full-screen frame (NO capture dock —
  the WebView editor owns the keyboard); home + list use `ScreenShell`. The keyboard
  accessory bar is a plain RN view positioned by `use-keyboard-height`
  (InputAccessoryView can't bind to a WebView); `hideKeyboardAccessoryView` on the DOM
  webview suppresses the native bar.

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
