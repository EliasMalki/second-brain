-- ============================================================================
--  channel_accounts RLS — close the one tenant table the §2c list missed
-- ============================================================================
--  channel_accounts is tenant data keyed by user_id (NOT org_id): one row per
--  user per channel (v0.5: a single 'app' row created by the onboarding
--  trigger in 20260610090002). It was the only tenant table left without an
--  RLS policy.
--
--  Live state when this migration was written: RLS was already ENABLED on the
--  table (set out-of-band — no prior migration enabled it) but had ZERO
--  policies, i.e. default-deny: no authenticated user could read even their
--  OWN channel account. This adds the missing policy so a user can see/manage
--  exactly their own rows, and re-asserts ENABLE (idempotent) so a rebuild
--  straight from migrations is self-contained.
--
--  Grain: user-scoped (user_id = auth.uid()), NOT org-scoped — the table has
--  no org_id. Mirrors the self-scoped tenant-root policies
--  (memberships_self_read / users_self_*) in 20260610090002. (select auth.uid())
--  is wrapped so Postgres evaluates it once per statement (initplan), matching
--  the other policies. Inserts in v0.5 happen only via the SECURITY DEFINER
--  onboarding trigger (BYPASSRLS); WITH CHECK confines any future client write
--  to the user's own rows.
-- ============================================================================

ALTER TABLE public.channel_accounts ENABLE ROW LEVEL SECURITY;
CREATE POLICY channel_accounts_self ON public.channel_accounts
  FOR ALL TO authenticated
  USING      (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
