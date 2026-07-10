-- ============================================================================
--  Activity log — append-only "who did what" feed (AI vs manual)
-- ============================================================================
--  Records task/note lifecycle events with the ACTOR that caused them, so the
--  owner can see whether a task was closed by the AI (classifier / command
--  interpreter / nightly job) or manually. There was no such attribution before:
--  every completion funnels through completeTask() which only sets status+time,
--  and the manual UI and command interpreter share the same mutators.
--
--  DESIGN NOTES:
--   * actor / action / entity_type are plain TEXT (not enums): an audit log
--     grows new event kinds with every feature, and — because logging is
--     BEST-EFFORT (a failed insert is swallowed so it never blocks the real
--     mutation) — a hard enum would silently DROP a row on any value it hasn't
--     learned yet. The vocabulary is enforced in TypeScript (lib/db/activity.ts).
--     Precedent: attachments.owner_type / links.from_type are already text.
--   * entity_id is a bare uuid with NO FK — polymorphic (task|note), same as
--     attachments/links. summary denormalizes the title so the feed still reads
--     after the entity is hard-deleted.
--   * owner_id is NULLABLE + ON DELETE SET NULL (mirrors tasks/notes): keep the
--     history if a user row is ever removed, and classifier-authored rows may
--     carry a null owner.
--   * APPEND-ONLY RLS: separate SELECT + INSERT policies, and deliberately NO
--     update/delete policy — with RLS enabled those commands are default-denied
--     for `authenticated`, so the app can read + append but never tamper. The
--     service-role edge client (nightly/classifier) has BYPASSRLS for writes and
--     any future pruning.
-- ============================================================================

CREATE TABLE activity_log (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id      uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id    uuid REFERENCES users(id) ON DELETE SET NULL,
    actor       text NOT NULL,   -- user | command | classifier | nightly | recurrence | ...
    action      text NOT NULL,   -- task_completed | task_rescheduled | recurrence_spawned | note_filed | ...
    entity_type text NOT NULL DEFAULT 'task',  -- task | note  (polymorphic, like attachments.owner_type)
    entity_id   uuid,            -- no FK by design (polymorphic; may be hard-deleted)
    summary     text,            -- denormalized entity title at event time; survives deletion
    detail      jsonb NOT NULL DEFAULT '{}'::jsonb,  -- {from,to,project_id,confidence,recurrence_id,reason,...}
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX activity_log_feed_idx   ON activity_log (org_id, created_at DESC);           -- the feed query
CREATE INDEX activity_log_actor_idx  ON activity_log (org_id, actor, created_at DESC);    -- the All/AI/Manual filter
CREATE INDEX activity_log_entity_idx ON activity_log (entity_type, entity_id);            -- "history of this task"

-- Append-only RLS: read + insert your org's rows; no update/delete (default-denied).
ALTER TABLE public.activity_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY activity_log_org_select ON public.activity_log
  FOR SELECT TO authenticated
  USING (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));
CREATE POLICY activity_log_org_insert ON public.activity_log
  FOR INSERT TO authenticated
  WITH CHECK (org_id IN (SELECT org_id FROM public.memberships WHERE user_id = (select auth.uid())));
