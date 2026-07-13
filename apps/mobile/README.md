# Second Brain — mobile (Expo, iOS-first)

React Native / Expo app in the monorepo. Consumes `@second-brain/shared` for all
queries, types, and domain logic. See `CLAUDE.md` for conventions and the scope
fence. "Second Brain" is a placeholder name — see the rename procedure in
`CLAUDE.md`.

## Prerequisites (one-time)

- Node + the monorepo installed: run `npm install` at the **repo root** (this is
  an npm workspace; never run install inside `apps/mobile`).
- `apps/mobile/.env` — copy from `.env.example` and fill in the public Supabase
  values (`EXPO_PUBLIC_SUPABASE_URL`, `EXPO_PUBLIC_SUPABASE_ANON_KEY`, same
  project as web) plus **`EXPO_PUBLIC_API_URL`** — the web app origin the app
  POSTs captures to (see "Capture backend" below).
- **iOS dev build (free Apple ID)** — Expo Go will NOT work (the custom URL
  scheme won't route there). Point the toolchain at Xcode and add pods:
  ```bash
  sudo xcode-select -s /Applications/Xcode.app/Contents/Developer
  sudo xcodebuild -license accept
  brew install cocoapods
  ```
  Then in Xcode → Settings → Accounts, add your Apple ID (a free "Personal Team"
  is enough). On first device install, trust the developer cert on the phone
  (Settings → General → VPN & Device Management) and enable Developer Mode.

## Run on a device (development)

From `apps/mobile`:
```bash
npx expo run:ios --device      # builds, signs, installs, starts Metro
```
Pick your iPhone when prompted. This runs a prebuild (generates the gitignored
`ios/` folder) and installs a dev client. Free-signing builds expire after ~7
days — re-run the same command to re-sign. After the first build, iterate with
`npx expo start --dev-client`.

Simulator (no signing, no phone): `npx expo run:ios`.

## Capture backend (`EXPO_PUBLIC_API_URL`)

Text/voice/receipt capture POST to the web app's API routes — those pipelines
must stay server-side (the classifier runs on the service-role key, and OpenAI
transcription/OCR keys never ship on-device). The routes authenticate the app's
Supabase JWT via a bearer-token bridge (`apps/web/lib/api-auth.ts`); reads go
straight to Supabase through `@second-brain/shared`.

Point the app at a running web server via `EXPO_PUBLIC_API_URL`:

- **Dev (recommended):** run `npm run dev` (web) on your Mac and set
  `EXPO_PUBLIC_API_URL=http://<your-Mac-LAN-IP>:3000`. The phone must be on the
  same Wi-Fi. Ensure the dev server is actually on port 3000 (stop any stale
  `next-server` first, or update the port to match). Real Supabase data, no deploy.
- **Prod:** set it to the deployed web URL (needs the bearer-bridge change
  deployed).

## Supabase dashboard (magic-link deep link)

The magic-link email is one https link shared by web and mobile. To enable the
mobile deep link end to end:

1. **Auth → URL Configuration → Redirect URLs:** add `secondbrain://auth/callback`
   (must match `AUTH_CALLBACK_URL` in `lib/branding.ts` and the web
   `MOBILE_REDIRECT_ALLOWLIST` exactly).
2. **Auth → Templates → both _Magic Link_ and _Confirm signup_** (new users get
   the signup template):
   - **Stage T0** (no web deploy needed — unlocks in-app code sign-in): add a
     line `Or enter this code in the app: {{ .Token }}`.
   - **Stage T1** (only AFTER the web change is deployed): set the link href to
     `{{ .SiteURL }}/auth/confirm?token_hash={{ .TokenHash }}&type=email&next={{ .RedirectTo }}`.

Until T1 + the web deploy, the mobile deep link is dormant and web magic links
behave exactly as before; the 6-digit code and password paths work regardless.

## Release (TestFlight) — Step 7

Production iOS builds go through **EAS Build** (cloud) → **TestFlight** internal
testing. The repo side is scaffolded (`eas.json`, iOS permission strings in
`app.json`); the rest needs **your** accounts. Everything below runs from
`apps/mobile/`.

### Prerequisites (yours — one-time)
1. **Apple Developer Program** membership ($99/yr). A free Apple ID can sideload
   a 7-day dev build but **cannot** use TestFlight — the paid program is required.
2. **Expo account** (free) for EAS: `npx eas-cli login`.
3. **The web app deployed to production.** The app's capture backend
   (`EXPO_PUBLIC_API_URL`) must be a public URL, not the `192.168.x` dev server —
   and it must be a deploy that includes the `lib/api-auth.ts` bearer bridge
   (Step 2). So the held Vercel push has to land before a TestFlight build is
   actually functional for capture.

### Env for the production build (NOT committed — set on EAS)
The three `EXPO_PUBLIC_*` vars must exist at build time. Set them once as EAS
**production** environment variables (never in the repo — keys stay out of git):
```bash
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_URL      --value "<your supabase url>"      --visibility plaintext
npx eas-cli env:create --environment production --name EXPO_PUBLIC_SUPABASE_ANON_KEY --value "<your anon key>"          --visibility sensitive
npx eas-cli env:create --environment production --name EXPO_PUBLIC_API_URL           --value "https://<prod-web-url>"  --visibility plaintext
```
(URL + anon key are the same values as `apps/mobile/.env`; `EXPO_PUBLIC_API_URL`
becomes the **production** web origin.)

### Build → submit → TestFlight
```bash
npx eas-cli login                       # Expo account
npx eas-cli init                        # links the project (writes extra.eas.projectId to app.json) — first time only
npx eas-cli build --platform ios --profile production
#   → EAS prompts to create/manage the iOS signing credentials (needs your
#     Apple login); it registers the bundle id com.eliasmalki.secondbrain and
#     builds a signed .ipa in the cloud (~10-20 min). appVersionSource=remote +
#     autoIncrement means the build number bumps itself each run.
npx eas-cli submit --platform ios --profile production --latest
#   → uploads the build to App Store Connect. First run: create the app record
#     in App Store Connect (App Store → + → New App, bundle id
#     com.eliasmalki.secondbrain), then EAS submits into it. Export compliance is
#     pre-answered (usesNonExemptEncryption:false), so no per-build prompt.
```
Then in **App Store Connect → your app → TestFlight**: the build appears after
processing (~5-15 min); add yourself/friends as **internal testers** and they
install via the **TestFlight** app. Internal testing needs no App Review.

### Notes
- **Monorepo:** run `eas` from `apps/mobile/`; EAS uploads the whole repo and
  installs from the root lockfile — the existing `metro.config.js` handles the
  workspace, no extra EAS config needed.
- **Permissions:** `app.json` now declares mic (voice), camera + photo library
  (receipts) usage strings — required or App Review rejects the build.
- **Name/bundle id** (`Second Brain` / `com.eliasmalki.secondbrain`) are baked
  into the App Store Connect record on first submit — rename BEFORE that if ever,
  via the `app.json` → `branding.ts` → web allowlist → Supabase procedure above.
- `ios/` stays gitignored — EAS prebuilds fresh in the cloud from `app.json`.

## Verify

- `npm run typecheck` (repo root — covers mobile, web, shared)
- `cd apps/mobile && npx expo export --platform ios` — bundles clean (proves
  shared subpath + native module resolution)
- `npx expo-doctor` — two warnings are EXPECTED (metro lookup override, react
  18/19 duplication); see `metro.config.js`.
