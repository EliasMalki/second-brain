# UI / UX Audit — Full App (desktop + mobile web)

**Phase A deliverable. Report only — nothing has been changed yet.**

Scope: consistency, correctness, and mobile behavior across every page/view, at desktop
width and mobile (375 / 390 px). No new features, no schema changes. Fixes happen in
Phase B, in approved batches (see the bottom of this file).

## How this was produced
- **Live walkthrough** on the running app (seeded throwaway account `uiaudit@sb.test`,
  fully isolated org) at 1280px and 375px: Home, Tasks (+ detail panel), Inbox, Notes,
  Projects listing + detail, Calendar. Confirmed the three reported bugs by hand.
- **31-agent code audit** over `app/(app)/**` and `app/globals.css` (~7,300 lines):
  nine per-area finders + six cross-cutting sweeps (undo, mobile, consistency, dark,
  feedback, duplicates), each finding **adversarially verified against source**, plus a
  completeness critic. 162 verified findings, deduplicated to **101** distinct issues.
- Two findings were **corrected after live testing** (noted inline below) — the agents
  were wrong in one direction, the preview tool unreliable in another; where they
  conflicted I trusted direct code + DOM reasoning.

## Tally
| Severity | Count | Meaning |
|---|---|---|
| **breaks-function** | 11 | a feature misbehaves or is unusable |
| **breaks-trust** | 33 | silent data action, lost input, or misleading state |
| **cosmetic** | 57 | visual inconsistency |

By category: 10 known-bug · 33 ux-correctness · 33 consistency · 19 mobile · 6 dark-mode.

---

## The three reported bugs — confirmed and located

**1. Complete has no undo (and it's app-wide, not just Home).**
Every "complete a task" surface fires `completeTaskAction` and moves on with **no undo
toast** — Home brief ([home-brief.tsx:54](app/(app)/home-brief.tsx:54)), Home board
([home-board.tsx:38](app/(app)/home-board.tsx:38)), "Got time?" queue
([got-time.tsx:74](app/(app)/got-time.tsx:74)), the Tasks list/grid/panel
([tasks-workspace.tsx:210](app/(app)/tasks/tasks-workspace.tsx:210)), the Calendar panel
([calendar-workspace.tsx:177](app/(app)/calendar/calendar-workspace.tsx:177)), and the
shared TaskRow on project/record pages ([task-row.tsx:65](app/(app)/tasks/task-row.tsx:65)).
The undo pattern the app *appears* to have only exists in **Inbox**
([inbox-workspace.tsx:866](app/(app)/inbox/inbox-workspace.tsx:866)), **Projects**
(`.undo-toast`), and the **capture** command path. `reopenTaskAction` already exists
([actions.ts:261](app/(app)/tasks/actions.ts:261)) to power the undo. *Verified live: completing
from the Home board showed no toast; the row just struck through and could not be reversed
in place.*

**2. Mobile horizontal overflow on Tasks (and Home).**
At 375px the Tasks list lays out ~740–1030px wide and scrolls sideways inside
`.app-content` (whose `overflow-x:auto` hides it from page-level checks). Root cause: at
`≤640px` `.panes` becomes `flex-direction:column` but keeps `align-items:flex-start`, so
the list column shrink-wraps to its widest row instead of filling the viewport
([globals.css:5307](app/globals.css:5307)); compounded by the task row's project tag
(`.h2tag`) never truncating and `.add-main` never wrapping. Home overflows too — its only
breakpoint is 920px, nothing below, so `.h-bento` content (~416px) overflows a 327px column
([globals.css:6438](app/globals.css:6438)). *Verified live at 375px on both pages.*

**3. Stray theme toggles.** The theme control belongs **only** in the account-card menu
(`.theme-seg`). Two strays exist: Home header
([page.tsx:261](app/(app)/page.tsx:261)) and Tasks header
([tasks-workspace.tsx:252](app/(app)/tasks/tasks-workspace.tsx:252)) — both also silently
clobber a "System" preference. *Verified live: the moon toggle is visible next to the clock
on Home and next to the List/Grid switch on Tasks.* Other duplicated controls found: two
create-project affordances on the Projects listing (persistent add bar **and** dashed ghost
card, [projects/page.tsx:120](app/(app)/projects/page.tsx:120)); four divergent
segmented-control styles and two back-link styles (consistency, Batch 3).

---

## Findings by category

Each item: **location** · **severity** · issue → proposed fix. Reuse existing tokens and
the shared components named. `⚠ VERIFY LIVE` marks a claim to sanity-check before fixing.

### 1 · Known bugs
- **Home/Tasks/Calendar complete → no undo** — `breaks-trust` — see reported bug #1 above.
  Fix: extract **one** `UndoToast` (from the Inbox `act()`/`.ibx-toast` + Projects
  `.undo-toast` pattern) and a shared `complete-with-undo` helper wired to
  `reopenTaskAction`; use it on all six surfaces so they behave identically.
- **Tasks & Home 375px overflow** — `breaks-function` — see reported bug #2. Fix: in the
  `≤640px` block give `.panes` `align-items:stretch` (or `.t-body/.t-list` `width:100%`);
  add a Tasks mobile breakpoint that ellipsizes `.tasks2 .h2tag` (max-width + text-overflow)
  and lets `.t-rmeta` shrink (`min-width:0`); add `flex-wrap:wrap` to `.add-main`; add a
  `<920px` isn't enough — add a real phone breakpoint for `.h-bento`/home controls.
- **Two stray theme toggles** — `breaks-trust` — remove `<ThemeToggle/>` from
  `.h-toprail` ([page.tsx:261](app/(app)/page.tsx:261)) and `.t-headrail`
  ([tasks-workspace.tsx:252](app/(app)/tasks/tasks-workspace.tsx:252)); keep LiveClock and
  the List/Grid toggle respectively.
- **Two create-project affordances** — `cosmetic` — Projects listing shows a persistent
  add bar **and** a dashed ghost card that just re-opens the same bar
  ([projects/page.tsx:120](app/(app)/projects/page.tsx:120)). Keep one entry point.

### 2 · UX correctness (actions & feedback)
**Missing undo / confirm on state-changing actions**
- **Calendar drag-to-reschedule** — `breaks-trust` —
  [calendar-workspace.tsx:227](app/(app)/calendar/calendar-workspace.tsx:227) mutates with
  no undo, and dropping a *timed* task on the all-day band or a month day **permanently
  discards its start/end time**. Fix: undo toast capturing prior `start_at/end_at/scheduled_for`;
  at minimum confirm before a drop that nulls an appointment's time.
- **Calendar slot click/drop lands ~7h off** — `breaks-function` — ⚠ VERIFY LIVE —
  [time-grid.tsx:71](app/(app)/calendar/time-grid.tsx:71) computes
  `clientY − rect.top + scrollTop`. Since `.tg-col` is a scrolling descendant of the
  `overflow-y:auto` `.tg-body`, `clientY − rect.top` **already** accounts for scroll; adding
  `scrollTop` double-counts. With the mount scroll pinned to 7am
  ([line 64](app/(app)/calendar/time-grid.tsx:64)) the first click lands 7 hours late.
  *(The automated verifier rejected this; my code+DOM algebra says it's real. The preview
  couldn't lay out the grid to confirm empirically — do a 10-second click-test first.)*
  Fix: drop `+ (bodyRef.current?.scrollTop ?? 0)`.
- **Records board stage move (drag + dropdown)** — `breaks-trust` —
  [records-board.tsx:106](app/(app)/records/records-board.tsx:106) persists silently (only
  failures toast). Fix: shared undo toast → `move(id, fromStage)`.
- **StageSelect dropdown** — `breaks-trust` —
  [stage-select.tsx:31](app/(app)/records/stage-select.tsx:31) `onChange→requestSubmit`, no
  undo. Fix: route through the same optimistic+undo path as the board.
- **Record archive** — `breaks-trust` —
  [records/[id]/page.tsx:87](app/(app)/records/[id]/page.tsx:87) single click, no confirm,
  no undo, no in-app restore. Fix: gate behind the `.pm-modal` confirm used for project
  delete + add "Show archived" / un-archive in RecordsSection.
- **Note archive** — `breaks-trust` —
  [notes-workspace.tsx:174](app/(app)/notes/notes-workspace.tsx:174) one-tap, note vanishes.
  Fix: undo toast → `setNoteArchived(id,false)` (mirror Inbox "Note archived · Undo").
- **Note move/file to folder** — `breaks-trust` —
  [notes-workspace.tsx:160](app/(app)/notes/notes-workspace.tsx:160) silent reclassification;
  note disappears from the current folder. Fix: "Moved to <folder> · Undo".
- **Note autosave has no error handling** — `breaks-trust` —
  [note-editor.tsx:52](app/(app)/notes/note-editor.tsx:52) a failed save leaves status stuck
  on "Saving…" and silently loses edits. Fix: try/catch → error state + retry toast; reset
  the no-op early-return path to idle.
- **Inbox discrepancy "Move to"** — `breaks-trust` —
  [inbox-workspace.tsx:657](app/(app)/inbox/inbox-workspace.tsx:657) one-tap irreversible
  reclassification while every sibling inbox action offers undo. Fix: undo that re-points to
  the original project + reopens the prompt (capture prior `project_id` server-side).
- **Tasks reschedule / field edits** — `breaks-trust` —
  [tasks-workspace.tsx:197](app/(app)/tasks/tasks-workspace.tsx:197) schedule/priority/project
  edits mutate with no undo. Fix: shared undo toast re-applying the pre-patch value.
- **Disconnect Google Calendar** — `breaks-trust` —
  [settings/calendar/page.tsx:60](app/(app)/settings/calendar/page.tsx:60) one click revokes
  + deletes OAuth tokens, no confirm/undo. Fix: confirm step + danger-token styling.
- **Debrief tuning buttons** — `breaks-trust` —
  [settings/debrief/page.tsx:136](app/(app)/settings/debrief/page.tsx:136) fire multi-second
  LLM Edge Functions with no pending state → looks idle, invites double runs. Fix: a
  `useFormStatus` submit button ("Running…", disabled), same as login's SubmitButton.

**Missing optimistic updates**
- **New note** blocks on the server round-trip with no pending state, can double-create —
  [notes-workspace.tsx:134](app/(app)/notes/notes-workspace.tsx:134). Fix: optimistic
  placeholder + open editor immediately; disable + while pending.
- **Voice-retry** pending state flashes for one frame, allows duplicate retries —
  [inbox-workspace.tsx:261](app/(app)/inbox/inbox-workspace.tsx:261). Fix: await the promise
  inside `startRetry`.
- **Shared TaskRow complete** submits a full server-action form with no optimistic state —
  [task-row.tsx:65](app/(app)/tasks/task-row.tsx:65). Fix: route through the shared
  complete-with-undo helper.

**Missing loading / empty states, and dead ends**
- **No route skeletons** for Calendar, Notes, Receipts, Recurrences — they fall back to the
  generic task-row skeleton that then jumps to a totally different layout
  ([loading.tsx:11](app/(app)/loading.tsx:11), [calendar/page.tsx:1](app/(app)/calendar/page.tsx:1)).
  Fix: per-route `loading.tsx` using shape-matched skeletons (`SkeletonBoard/SkeletonCard`
  exist).
- **Home & Tasks skeletons are stale** — both mimic the old Today list, not the
  command-center layout, so navigation visibly jumps
  ([loading.tsx:9](app/(app)/loading.tsx:9), [tasks/loading.tsx:4](app/(app)/tasks/loading.tsx:4)).
- **"This week" board column** is a dead end when empty — footer hardcoded null while Now/Backlog
  get an add/see-more link ([page.tsx:213](app/(app)/page.tsx:213)). Fix: give it a
  "Plan this week" footer.
- **Deleted/invalid note** → `notFound()` with no `not-found.tsx`, so the bare Next 404 with
  no app chrome ([notes/[id]/page.tsx:23](app/(app)/notes/[id]/page.tsx:23)). Fix: add
  `app/(app)/not-found.tsx` inside the shell with a way back.
- **Deep-link to a completed/cancelled task** opens nothing, no feedback —
  [tasks-workspace.tsx:162](app/(app)/tasks/tasks-workspace.tsx:162). Fix: "This task is
  completed — view it" affordance.
- **Tasks detail click-away** references stale class names, so clicking another row
  closes-then-reopens the panel ([task-panel.tsx:59](app/(app)/tasks/task-panel.tsx:59)).
  Fix: update the ignore-list selectors to `.t-row/.t-card/.t-bar/.add-bar`.
- **Archived projects** render at full prominence with no unarchive affordance
  ([projects/page.tsx:163](app/(app)/projects/page.tsx:163)). Fix: `.pc.archived` muted
  treatment + reactivate action.

**Feature regressions found (decide: rewire vs delete)**
- **First-open in-app brief is gone** — `cosmetic` (corrected down from breaks-function:
  the live `HomeBrief` still shows a brief) — `BriefCard` and `getFirstOpenBrief` are
  orphaned, so `briefs_log.shown_at` is never stamped (BUILD_SPEC §5 said keep it)
  ([brief-card.tsx:7](app/(app)/brief-card.tsx:7)).
- **Today's calendar is gone from Home** — `breaks-function` — `CalendarToday` is orphaned;
  Home shows no Google events, no "Connect Google Calendar" CTA, no "needs reconnecting"
  warning ([calendar-today.tsx:19](app/(app)/calendar-today.tsx:19)). Fix: feed
  `getTodayEvents()` into the HomeBrief agenda, keep the connect/reconnect states.
- **Home capture-type chips are fake** — `breaks-trust` — Auto/Task/Note/Idea/Event render
  with `cursor:pointer`, hover, and an "on" state but are inert `aria-hidden` spans
  ([capture-box.tsx:882](app/(app)/capture-box.tsx:882)). Fix: wire them to hint the
  interpreter, or make them visibly decorative.
- **"Got time?" false fit** — `breaks-trust` — when nothing matches the window it silently
  falls back to the whole pool, so "Best fit for 20 minutes" sits over a ~2 hr deep-work task
  ([got-time.tsx:66](app/(app)/got-time.tsx:66)). Fix: honest empty-state copy.
- **Cross-route stale counts** — `cosmetic` (⚠ **corrected down** from breaks-trust) —
  `completeTaskAction` doesn't `revalidatePath("/")`
  ([actions.ts:252](app/(app)/tasks/actions.ts:252)). *Live test: completing **on** Home
  reconciles fine — invoking a server action from a client component auto-refreshes the
  current route.* The residual issue is only cross-route: complete on Tasks, then
  client-navigate to Home, and cached counts can lag until refetch. Fix: add
  `revalidatePath("/")` to the task mutations for cache correctness.
- **Capture can be lost when offline AND the POST fails** — `breaks-trust` — the form resets
  before confirming persistence; a transient online error also shows the misleading "Saved
  offline…" toast (capture-box + offline queue). Fix: don't reset until IndexedDB or POST
  confirms; distinguish real offline from a failed online POST. *(Invariant: capture must
  never lose data — worth confirming carefully.)*

### 3 · Consistency
**Project color used as a saturated fill (violates the hard invariant)** — `breaks-trust`
- Listing cards paint the **whole header band + progress bar** in the raw project color
  ([globals.css:7186](app/globals.css:7186)); project **detail hero** and **edit/delete
  modal headers** fill a solid `var(--proj)` background
  ([globals.css:7230](app/globals.css:7230)). *Verified live — Car Flipping is a full blue
  card and a full blue hero.* This is the recent redesign; per CLAUDE.md project color must
  stay quiet (dots / pale tags / ~3px edges), priority chips are the only saturated color.
  Fix: neutral surface + color dot + ~3px `--proj` edge; render progress as a color-mix tint.
  **See "Decisions needed" — this reverses a shipped redesign, so confirm before doing it.**

**Borders (system is 0.5px; these are 1px)** — `cosmetic`
- Home hero composer `border:1px` ([globals.css:6289](app/globals.css:6289)); new-project
  ghost card `1px dashed` ([globals.css:7208](app/globals.css:7208)); Tasks complete circle
  `1.6px` ([globals.css:6540](app/globals.css:6540)).

**Page width & title jumps** — `cosmetic`
- Content max-width differs per page: Home 1140px, Tasks/Projects 1120px, everything else
  `--content-max` (1408px) — the column visibly jumps on every navigation
  ([globals.css:6254](app/globals.css:6254), [6245](app/globals.css:6245)). The **composer
  dock** caps at 1408px on all of them, so its edges overhang the narrower redesigned pages.
  Fix: one shared width token consumed by content wrappers **and** the dock.
- Four page-title treatments: Home 30/700, Tasks 28/700, Projects 28/600, legacy `.view-title`
  22/500 ([globals.css:6271](app/globals.css:6271), [1950](app/globals.css:1950)). Fix: one
  title token everywhere; keep Home's greeting copy but not its bespoke size.

**Duplicate control styles** — `cosmetic`
- **Priority chips** exist in three palettes (`.chip-*`, `.h2chip.*` hardcoded hex,
  `.badge-prio-*`), so the same priority renders different colors on one screen — C is gray
  in the Tasks list but blue in the detail panel ([globals.css:6432](app/globals.css:6432),
  [1990](app/globals.css:1990)). Fix: one token-based A/B/C/D scale (dark-mode included).
- **Segmented controls** in four styles: `.t-toggle`, `.h-seg`, `.viewtoggle`, `.theme-seg`
  ([globals.css:6481](app/globals.css:6481)). Consolidate to one.
- **Dropdowns**: the task panel mixes custom `.fdrop` menus (Priority/Project/When) with raw
  native `<select>` (Effort/Avail.) in adjacent rows
  ([task-panel.tsx:240](app/(app)/tasks/task-panel.tsx:240)). Pick one.
- **Back links** mix a raw "←" glyph with Tabler icons and a bespoke `.p2-back` pill vs a
  plain `.view-sub` arrow across detail pages
  ([notes/[id]/page.tsx:36](app/(app)/notes/[id]/page.tsx:36),
  [projects/[id]/page.tsx:78](app/(app)/projects/[id]/page.tsx:78)). One shared back-link.
- **Toasts** differ per page: Home/capture/Projects are bottom-right light with safe-area;
  Inbox is bottom-center dark `--tech` at `bottom:18px` with no safe-area
  ([globals.css:7009](app/globals.css:7009)). One toast component (this is also what the
  missing complete-undos should use).

**Icons / surfaces** — `cosmetic`
- Raw Unicode glyphs instead of Tabler: receipt delete "✕"
  ([delete-receipt-button.tsx:28](app/(app)/receipts/delete-receipt-button.tsx:28)), TaskRow
  ✓/✕ ([task-row.tsx:73](app/(app)/tasks/task-row.tsx:73)). Swap to `ti ti-x`/`ti ti-check`.
- Calendar Google source icon is a saturated multicolor inline SVG
  ([source-icon.tsx:28](app/(app)/calendar/source-icon.tsx:28)) — against Tabler-only +
  quiet-color. Use a monochrome mark.
- Danger red hardcoded `#c0362c` / `#c0362c` in delete-modal header + button instead of the
  `--danger` token, so it doesn't adapt to theme ([globals.css:7305](app/globals.css:7305)).
- Orphaned dead code from the pre-redesign Today view: `quick-wins.tsx`, `backlog-pool.tsx`,
  `home-actions.ts` ([home-actions.ts:12](app/(app)/home-actions.ts:12)). Delete or re-adopt.

### 4 · Mobile web
**Tap targets < 44px** — `cosmetic` (except where noted)
- Home controls — 18px complete circle, 21px expand, ~27px segments, 34/38px icon/mic/send —
  no coarse-pointer bump ([globals.css:6417](app/globals.css:6417), [6294](app/globals.css:6294)).
  `breaks-function` here because the 18px check sits inside a card whose whole surface opens
  the panel, so mis-taps silently complete (undo-less) — pairs with Batch 1.
- Inbox batch-file button ([globals.css:7102](app/globals.css:7102)); Notes header icon
  buttons incl. the back chevron are 30×30 ([globals.css:4471](app/globals.css:4471));
  Projects create/options/swatch ([globals.css:7158](app/globals.css:7158)); project-detail
  tabs/seg/action buttons ([globals.css:7268](app/globals.css:7268)); Calendar nav 40px —
  and the CSS comment even claims 44px ([globals.css:6091](app/globals.css:6091)); Tasks
  add-bar/filter pills at 40px ([globals.css:4351](app/globals.css:4351)).

**Responsive breakage** — `breaks-function` unless noted
- **Quick-add composer can't reflow** — `.add-main` has no `flex-wrap`, so the mobile rule
  that drops the date chips to their own line is dead
  ([globals.css:4896](app/globals.css:4896)).
- **Offline banner pushes the shell off-screen** — it's a block sibling above a fixed
  `100dvh` shell, so appearing offline shoves the bottom-docked composer below the fold —
  exactly when offline capture matters ([layout.tsx:59](app/(app)/layout.tsx:59)). Fix: make
  the shell `flex:1; min-height:0` under a column flex container so the banner subtracts
  height.
- **Calendar mobile agenda** only renders days that already have items, so you can't add to
  an empty day and the empty-range state has no add CTA
  ([agenda-list.tsx:24](app/(app)/calendar/agenda-list.tsx:24)).
- **Notes tables clipped, not scrollable** at 375px despite the code comment claiming they
  scroll ([globals.css:4710](app/globals.css:4710)) — `cosmetic`. Wrap in `overflow-x:auto`.
- **Pane resizer** has no `touch-action:none`, so touch drag is hijacked by scroll
  ([pane-resizer.tsx:26](app/(app)/notes/pane-resizer.tsx:26)) — `cosmetic`.
- **Swipe-over-input** — Inbox question card's swipe-to-dismiss wraps the answer field, so a
  horizontal drag inside the input discards the draft
  ([inbox-workspace.tsx:831](app/(app)/inbox/inbox-workspace.tsx:831)) — `cosmetic`.
- **Project filter dropdown** left-anchored with 11rem min-width runs off the right edge on a
  wrapped mobile filter bar ([globals.css:4059](app/globals.css:4059)) — `cosmetic`.
- **Edit-project modal footer** packs Delete+Cancel+Save on one non-wrapping row; at 375px
  Save can clip (modal is `overflow:hidden`) ([globals.css:7322](app/globals.css:7322)) —
  `cosmetic`.

**Safe areas & keyboard** — `breaks-trust`/`cosmetic`
- Inbox undo toast at `bottom:18px` with no `env(safe-area-inset-bottom)` overlaps the
  composer and sits in the home-indicator zone ([globals.css:7011](app/globals.css:7011)).
  *Verified live.* Fix: `calc(98px + env(safe-area-inset-bottom))`.
- `ViewportFix` copies only `visualViewport.height` and ignores `offsetTop`, so the layout
  can shift when the keyboard opens ([viewport-fix.tsx](app/(app)/viewport-fix.tsx)) —
  `breaks-function`.

**Right-side panels on mobile** — *Verified live: the Tasks task-panel becomes a
full-screen `position:fixed` sheet at 375px — good.* No change needed there; the sheet just
needs the shared safe-area + tap-target treatment above.

### 5 · Dark mode
- **Offline banner** paints white text on the warning **foreground** token as a background →
  bright yellow, unreadable in dark ([globals.css:946](app/globals.css:946)) —
  `breaks-function`. Fix: use `--warn-bg`/`--warn` (both have dark overrides).
- **No-color project band** (the default for every new project) → white text on light-gray
  fill in dark, name nearly illegible ([globals.css:7186](app/globals.css:7186)) —
  `breaks-trust`. Resolved by the "quiet project color" fix in Batch 3.
- **No-color project hero / edit modal** → `#fff` text on the `--proj` neutral fallback
  (`#a1a1aa` in dark), illegible ([globals.css:7230](app/globals.css:7230)) —
  `breaks-trust`. Same fix.
- **Composer sheen** — fixed near-opaque white inset highlight over the dark translucent
  composer reads as an over-bright top edge ([globals.css:1508](app/globals.css:1508)) —
  `cosmetic`. Fix: a `--sheen` token with a dark override.
- **Delete-modal danger red** hardcoded, stays dark-red in dark while other danger surfaces
  lighten ([globals.css:7305](app/globals.css:7305)) — `cosmetic`. Token it.
- **PWA `theme-color`** follows `prefers-color-scheme` only, so a manually chosen theme
  leaves the browser chrome the wrong color ([layout.tsx:25](app/layout.tsx)) — `cosmetic`.

---

## Phase B — fix plan (commit per batch, in this order)

Rules: fix only what's above; no redesigns, no new features, no schema/query changes beyond
what a fix needs; reuse existing tokens/components; keep the invariants (markdown-only notes,
priority-only saturated color, email-only notifications).

- **Batch 1 — function bugs & reported known bugs (19):** the shared undo toast + complete
  helper across all six complete surfaces; Tasks + Home 375px overflow; remove the two theme
  toggles; de-dupe the create-project affordance; the calendar slot-offset fix (do the
  ⚠ live click-test first).
- **Batch 2 — trust (29):** remaining undo/confirm paths (calendar drag, records
  stage/board, note archive/move, record archive, disconnect calendar, inbox move, tasks
  reschedule); autosave error handling; missing optimistic (new note, voice retry, TaskRow);
  loading skeletons + empty states + dead ends (not-found, deep-links, "This week" footer);
  the capture-loss + offline-banner-shell fixes; the fake-chips / false-fit / orphaned
  CalendarToday decisions.
- **Batch 3 — consistency (32):** the quiet-project-color conversion (**pending your
  decision**), 1px→0.5px borders, one width token + composer alignment, one title style, one
  priority-chip scale, one segmented control, one dropdown style, one back link, one toast,
  Tabler-only icons, danger token, delete dead code.
- **Batch 4 — mobile polish (15):** 44px tap targets everywhere, `.add-main` wrap, safe-area
  on the (now unified) toast, `ViewportFix` offsetTop, calendar agenda empty-day add, notes
  table scroll + resizer touch-action, swipe-over-input guard, filter-dropdown anchor,
  edit-modal footer wrap.
- **Batch 5 — dark mode (6):** offline banner tint pair, project band/hero legibility (falls
  out of Batch 3's color fix), composer sheen token, danger token, PWA theme-color.

## Decisions needed before Batch 3
1. **Quiet project color.** The recent Projects redesign deliberately made cards/hero/modals
   full saturated project color. That directly violates the CLAUDE.md invariant ("project
   color stays quiet; priority chips are the only saturated color") and causes the dark-mode
   legibility failures. Reverting it to dots/tints/3px-edges is the single biggest visual
   change in this pass. **Confirm you want that reversal**, or tell me the invariant is
   intentionally relaxed for these surfaces and I'll leave the color but still fix only the
   dark-mode legibility.
2. **Orphaned `BriefCard` / `CalendarToday` / pre-redesign modules.** Rewire (restore
   first-open-brief logging + today's calendar on Home) or delete and record the deviation?
   My default: restore `CalendarToday` on Home (real feature loss), delete `BriefCard` +
   `quick-wins`/`backlog-pool` (superseded). Say the word if you'd rather keep them.

## Noted during the monorepo restructure (2026-07-12) — do NOT fix yet
Observations from the Phase-1 extraction pass (no behavior was changed; these are
pre-existing). Filed here per session rules.

- **Two overdue rules coexist.** `listOverdueTasks` (brief/DB path) counts
  `scheduled_for < today` only; `isOverdue` (Home + Tasks views, now
  `packages/shared/src/domain/buckets.ts`) counts `scheduled_for OR due_date`. The code
  comments already acknowledge the divergence (`lib/commands/reads.ts`) — decide one rule.
- **Brief logic is duplicated across runtimes.** `packages/shared/src/db/brief.ts` (in-app)
  vs `supabase/functions/_shared/brief.ts` (email, Deno) re-implement hidden-projects +
  availability + "today" slightly differently (email uses a single `lte(scheduled_for, today)`).
  Extraction made the app side canonical; the Deno copy still drifts on its own.
- **Receipt totals are computed three ways** (all now in `packages/shared`):
  `projects.listProjectsWithStats` inline reduce, `receipts.sumAmounts`,
  `records.sumReceiptsByRecord`. Could collapse to one helper.
- **Orphaned code:** `getTodayEvents` (anon variant, `apps/web/lib/db/calendar.ts`) has zero
  call sites (Home uses the admin variant); `quick-wins.tsx` / `backlog-pool.tsx` were already
  flagged above.
