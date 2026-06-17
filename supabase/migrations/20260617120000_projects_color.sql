-- ============================================================================
--  Per-project color  —  Projects redesign (PART 1)
-- ============================================================================
--  The ONLY schema change for the Projects redesign: one additive, nullable
--  column. Stores a SINGLE base color per project — a curated palette key
--  ('blue' / 'teal' / 'slate' …) or a raw #hex. NULL = neutral default.
--
--  We never store multiple shades: every tint (pale tag background, dot/edge
--  base, darkened text) is derived in the UI from this one base via CSS
--  color-mix, so the same value adapts to light and dark automatically.
--
--  RLS is unchanged — the new column is covered by the existing org_isolation
--  policy on projects (policies are row-scoped, not column-scoped).
-- ============================================================================

ALTER TABLE public.projects ADD COLUMN color text;
