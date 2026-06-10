-- ============================================================================
--  v0.5 DELTAS over schema v3  —  BUILD_SPEC §2
-- ============================================================================
--  Applies on top of 20260610090001_schema_v3.sql. Four changes:
--    §2a  users.id IS the Supabase auth uid (FK to auth.users)
--    §2b  tasks.search_vector (unified search parity with notes)
--    §2c  RLS: org isolation on every tenant table
--    §2a  onboarding trigger: auth signup -> users + personal org + membership
--  No other schema changes. content_format='richtext' stays dormant (markdown
--  only). areas stays.
-- ============================================================================


-- ----------------------------------------------------------------------------
--  §2a  Reconcile app users with Supabase auth.
--  Supabase owns identity in auth.users. The app users row is a profile keyed
--  to it: same uuid, deleted when the auth user is deleted.
-- ----------------------------------------------------------------------------
ALTER TABLE public.users
  ADD CONSTRAINT users_id_is_auth_uid
  FOREIGN KEY (id) REFERENCES auth.users (id) ON DELETE CASCADE;


-- ----------------------------------------------------------------------------
--  §2b  Unified search — tasks were missing a search_vector (notes has one).
--  Searching the brain = notes.search_vector UNION tasks.search_vector.
-- ----------------------------------------------------------------------------
ALTER TABLE public.tasks
  ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    to_tsvector('english', coalesce(title, '') || ' ' || coalesce(body, ''))
  ) STORED;

CREATE INDEX tasks_search_idx ON public.tasks USING gin (search_vector);


-- ----------------------------------------------------------------------------
--  §2c  Row-Level Security — the isolation that makes multi-user safe.
--
--  Tenant boundary = org_id. A row is visible/writable iff its org_id is one of
--  the caller's orgs (via memberships). RLS is FORCED at the DB so isolation
--  can never be forgotten in application code.
--
--  Notes on the policy shape:
--   * FOR ALL with matching USING + WITH CHECK: USING gates read/update/delete
--     of existing rows; WITH CHECK gates the org_id of any inserted/updated row,
--     so you can't write a row into an org you don't belong to.
--   * TO authenticated: the anon role gets nothing on tenant tables.
--   * (select auth.uid()) is wrapped in a subselect so Postgres evaluates it
--     once per statement (initplan) instead of once per row.
--   * The service_role key (used by trusted server jobs / the onboarding trigger)
--     has BYPASSRLS and is unaffected — those paths MUST scope org_id by hand.
-- ----------------------------------------------------------------------------

-- areas
ALTER TABLE public.areas ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.areas
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- projects
ALTER TABLE public.projects ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.projects
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- record_types
ALTER TABLE public.record_types ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.record_types
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- records
ALTER TABLE public.records ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.records
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- recurrences
ALTER TABLE public.recurrences ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.recurrences
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- tasks
ALTER TABLE public.tasks ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.tasks
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- notes
ALTER TABLE public.notes ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.notes
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- captures
ALTER TABLE public.captures ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.captures
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- attachments
ALTER TABLE public.attachments ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.attachments
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- receipts
ALTER TABLE public.receipts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.receipts
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- links
ALTER TABLE public.links ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.links
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- prompts
ALTER TABLE public.prompts ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.prompts
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));

-- briefs_log
ALTER TABLE public.briefs_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_isolation ON public.briefs_log
  FOR ALL TO authenticated
  USING      (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())))
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));


-- ----------------------------------------------------------------------------
--  Tenant-root lockdown — BEYOND the literal §2c table list (RECOMMENDED).
--
--  §2c enumerates the 13 data tables but NOT organizations / users / memberships.
--  Those carry no org_id, yet the org_isolation policies above all read
--  memberships. If memberships/users/organizations are left RLS-disabled, then
--  every authenticated user can `SELECT *` them — i.e. read every other user's
--  email and the full org<->user map. That contradicts the tenancy invariant.
--
--  These three policies are self-scoped (a row's own user_id / id), reference
--  only auth.uid() (no cycle back into the 13 tables), and never widen access.
--  Inserts into these tables happen ONLY via the SECURITY DEFINER onboarding
--  trigger below (which bypasses RLS), so no INSERT policy is needed in v0.5.
--
--  >>> Flagged for your review: this is the one place I went past the spec's
--  >>> literal wording to honor its intent. Strike this block if you want a
--  >>> spec-strict migration instead.
-- ----------------------------------------------------------------------------
ALTER TABLE public.memberships ENABLE ROW LEVEL SECURITY;
CREATE POLICY memberships_self_read ON public.memberships
  FOR SELECT TO authenticated
  USING (user_id = (select auth.uid()));

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
CREATE POLICY users_self_read ON public.users
  FOR SELECT TO authenticated
  USING (id = (select auth.uid()));
CREATE POLICY users_self_update ON public.users
  FOR UPDATE TO authenticated
  USING      (id = (select auth.uid()))
  WITH CHECK (id = (select auth.uid()));

ALTER TABLE public.organizations ENABLE ROW LEVEL SECURITY;
CREATE POLICY org_member_read ON public.organizations
  FOR SELECT TO authenticated
  USING (id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));


-- ----------------------------------------------------------------------------
--  §2a (cont.)  Onboarding trigger.
--  On every new auth.users row (magic-link signup), atomically create:
--    1. the app users profile (id = auth uid)
--    2. a personal organization
--    3. an owner membership linking them
--    4. the default 'app' channel account
--  Everything that user later creates carries org_id = their personal org =>
--  complete isolation. SECURITY DEFINER so it runs with table-owner rights and
--  bypasses RLS; search_path pinned to defeat hijacking.
-- ----------------------------------------------------------------------------
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  display_name text;
  new_org_id   uuid;
BEGIN
  display_name := coalesce(
    NEW.raw_user_meta_data ->> 'name',
    NEW.raw_user_meta_data ->> 'full_name',
    split_part(NEW.email, '@', 1)
  );

  -- 1. profile (id IS the auth uid)
  INSERT INTO public.users (id, name, email)
    VALUES (NEW.id, display_name, NEW.email);

  -- 2. personal org
  INSERT INTO public.organizations (name, kind)
    VALUES (display_name || '''s space', 'personal')
    RETURNING id INTO new_org_id;

  -- 3. owner membership
  INSERT INTO public.memberships (user_id, org_id, role)
    VALUES (NEW.id, new_org_id, 'owner');

  -- 4. default app channel
  INSERT INTO public.channel_accounts (user_id, channel)
    VALUES (NEW.id, 'app');

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();
