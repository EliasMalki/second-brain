-- ============================================================================
--  SECOND BRAIN / SECRETARY  —  schema v3  (PostgreSQL 14+)
-- ============================================================================
--  WHAT CHANGED FROM v2:
--   * ORG/TENANT ROOT. organizations + memberships (user<->org, many-to-many).
--     Every data row carries org_id — the tenant boundary. In v1 each user gets
--     one auto-created PERSONAL org and is its sole member, giving each person a
--     fully isolated "own app." v2 = a user joins more orgs (just more rows).
--   * RECORDS LAYER (live in v1). A project can hold many "records" (the user
--     names the type: Car / Client / Reno job / Property). A record has a name,
--     a stage in a user-defined pipeline, and its own tasks/notes/receipts, plus
--     an intake checklist that spawns standard tasks on creation. NO arbitrary
--     custom fields — kept general, not niche.
--
--  TENANT ISOLATION: every query is scoped to the caller's org(s) via membership.
--   Recommended to enforce with Postgres Row-Level Security policies keyed on a
--   session 'app.current_org' setting, so isolation can't be forgotten in code.
--
--  v1 / v2 / v3 tags in comments mark what is built now vs wired-but-dormant.
-- ============================================================================

CREATE EXTENSION IF NOT EXISTS pgcrypto;

-- ---------- enums -----------------------------------------------------------
CREATE TYPE org_kind        AS ENUM ('personal', 'team');   -- 'team' used in v2
CREATE TYPE org_role        AS ENUM ('owner', 'admin', 'member');  -- RBAC seed for v2
CREATE TYPE area_kind       AS ENUM ('business', 'personal');
CREATE TYPE project_status  AS ENUM ('active', 'paused', 'archived');
CREATE TYPE availability     AS ENUM ('anytime', 'business_hours');
CREATE TYPE task_status     AS ENUM ('open', 'done', 'snoozed', 'waiting',
                                     'cancelled', 'needs_clarification');
CREATE TYPE priority         AS ENUM ('A', 'B', 'C', 'D');
CREATE TYPE set_by           AS ENUM ('system', 'user');
CREATE TYPE effort           AS ENUM ('quick', 'deep');
CREATE TYPE recur_freq      AS ENUM ('daily', 'weekly', 'monthly', 'yearly');
CREATE TYPE recur_anchor    AS ENUM ('fixed', 'completion');
CREATE TYPE note_kind       AS ENUM ('quick', 'journal', 'reference', 'meeting', 'workflow');
CREATE TYPE content_format  AS ENUM ('markdown', 'richtext');
CREATE TYPE record_status   AS ENUM ('active', 'archived');
CREATE TYPE source_channel  AS ENUM ('app', 'voice',                 -- [v1]
                                     'telegram', 'whatsapp', 'sms',  -- [v2]
                                     'imessage', 'slack', 'teams', 'outlook');  -- [v2]
CREATE TYPE capture_status  AS ENUM ('processed', 'needs_clarification', 'failed');
CREATE TYPE result_kind     AS ENUM ('task', 'note', 'receipt', 'record', 'command', 'none');
CREATE TYPE prompt_type     AS ENUM ('unsorted', 'question', 'discrepancy', 'nudge');
CREATE TYPE prompt_status   AS ENUM ('pending', 'answered', 'dismissed', 'snoozed');
CREATE TYPE channel_kind    AS ENUM ('app', 'telegram', 'whatsapp', 'sms',
                                     'imessage', 'slack', 'teams', 'outlook');
CREATE TYPE brief_kind      AS ENUM ('daily', 'weekly');

CREATE OR REPLACE FUNCTION touch_updated_at() RETURNS trigger AS $$
BEGIN NEW.updated_at = now(); RETURN NEW; END;
$$ LANGUAGE plpgsql;

-- ============================================================================
--  TENANT ROOT
-- ============================================================================
CREATE TABLE organizations (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    kind        org_kind NOT NULL DEFAULT 'personal',   -- v1 auto-creates one 'personal' org per user
    created_at  timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE users (
    id          uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    name        text NOT NULL,
    email       text UNIQUE NOT NULL,         -- multi-user auth in v1
    settings    jsonb NOT NULL DEFAULT '{}',  -- debrief cadence, brief time, etc.
    created_at  timestamptz NOT NULL DEFAULT now()
);

-- user <-> org, many-to-many. v1: exactly one row per user (their personal org).
CREATE TABLE memberships (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id    uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    role       org_role NOT NULL DEFAULT 'owner',   -- v1: everyone owns their personal org
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (user_id, org_id)
);
CREATE INDEX memberships_user_idx ON memberships (user_id);
CREATE INDEX memberships_org_idx  ON memberships (org_id);

-- ============================================================================
--  STRUCTURE  (every table below carries org_id = the tenant boundary)
-- ============================================================================
CREATE TABLE areas (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    name      text NOT NULL,
    kind      area_kind NOT NULL,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX areas_org_idx ON areas (org_id);

CREATE TABLE projects (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    area_id       uuid REFERENCES areas(id) ON DELETE SET NULL,
    name          text NOT NULL,
    description   text,                          -- markdown: WHAT it is (classifier context)
    status        project_status NOT NULL DEFAULT 'active',
    aliases       text[] NOT NULL DEFAULT '{}',
    availability_default availability NOT NULL DEFAULT 'anytime',
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX projects_org_idx     ON projects (org_id);
CREATE INDEX projects_aliases_idx ON projects USING gin (aliases);
CREATE TRIGGER projects_touch BEFORE UPDATE ON projects
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();
-- WORKFLOW (how you did it) = a note with kind='workflow' pinned to the project.

-- ---------- record types : the user-named container kind per project --------
CREATE TABLE record_types (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    label_singular text NOT NULL,                -- "Car" / "Client" / "Reno job" / "Property"
    label_plural   text NOT NULL,                -- "Cars" / "Clients" ...
    stages         text[] NOT NULL DEFAULT '{}', -- ordered pipeline: {in_stock,reserved,sold}
    intake_checklist jsonb NOT NULL DEFAULT '[]',-- [{title, effort, priority}] spawned on new record
    created_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX record_types_project_idx ON record_types (project_id);
-- NOTE: deliberately NO arbitrary custom fields in v1 — kept general, not niche.

-- ---------- records : a car / client / job, owning its own tasks ------------
CREATE TABLE records (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    project_id     uuid NOT NULL REFERENCES projects(id) ON DELETE CASCADE,
    record_type_id uuid NOT NULL REFERENCES record_types(id) ON DELETE CASCADE,
    name           text NOT NULL,                -- "2019 Civic" / "Ahmed K." / "Smith kitchen"
    stage          text,                         -- one of record_type.stages (app-enforced)
    status         record_status NOT NULL DEFAULT 'active',
    created_at     timestamptz NOT NULL DEFAULT now(),
    updated_at     timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX records_project_idx ON records (project_id, status);
CREATE INDEX records_org_idx     ON records (org_id);
CREATE TRIGGER records_touch BEFORE UPDATE ON records
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- recurrences -----------------------------------------------------
CREATE TABLE recurrences (
    id                       uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id                   uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id                 uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    project_id               uuid REFERENCES projects(id) ON DELETE CASCADE,
    record_id                uuid REFERENCES records(id) ON DELETE CASCADE,  -- recurring task on a record
    title_template           text NOT NULL,
    freq                     recur_freq NOT NULL,
    interval                 int NOT NULL DEFAULT 1,
    byday                    text[],
    bymonthday               int,
    anchor                   recur_anchor NOT NULL DEFAULT 'fixed',
    lead_days                int NOT NULL DEFAULT 0,
    default_effort           effort,
    default_priority         priority NOT NULL DEFAULT 'C',
    default_availability     availability,
    start_date               date NOT NULL,
    until                    date,
    last_materialized_through date,
    active                   boolean NOT NULL DEFAULT true,
    created_at               timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX recurrences_active_idx ON recurrences (active, last_materialized_through);

-- ---------- tasks -----------------------------------------------------------
CREATE TABLE tasks (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    assignee_id    uuid REFERENCES users(id) ON DELETE SET NULL,   -- [v2] = owner in v1
    project_id     uuid REFERENCES projects(id) ON DELETE SET NULL,
    record_id      uuid REFERENCES records(id) ON DELETE CASCADE,  -- set => belongs to that car/client/job
    recurrence_id  uuid REFERENCES recurrences(id) ON DELETE SET NULL,
    title          text NOT NULL,
    body           text,
    status         task_status NOT NULL DEFAULT 'open',
    priority       priority NOT NULL DEFAULT 'C',
    priority_set_by set_by NOT NULL DEFAULT 'system',
    effort         effort,
    availability   availability,                 -- null => inherit project default
    scheduled_for  date,
    due_date       date,
    start_at       timestamptz,                   -- set => fixed-time appointment
    end_at         timestamptz,
    snooze_until   date,
    waiting_on     text,
    follow_up_on   date,
    rollover_count int NOT NULL DEFAULT 0,
    source         source_channel,
    original_text  text,
    reviewed_at    timestamptz,
    created_at     timestamptz NOT NULL DEFAULT now(),
    completed_at   timestamptz
);
CREATE INDEX tasks_brief_idx    ON tasks (org_id, status, scheduled_for);
CREATE INDEX tasks_project_idx  ON tasks (project_id);
CREATE INDEX tasks_record_idx   ON tasks (record_id);
CREATE INDEX tasks_due_idx      ON tasks (due_date);
CREATE INDEX tasks_assignee_idx ON tasks (assignee_id);
-- [v3] handoff progress/comments attach here later via a task_comments table.

-- ---------- notes -----------------------------------------------------------
CREATE TABLE notes (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    project_id    uuid REFERENCES projects(id) ON DELETE SET NULL,  -- NULL = Inbox
    record_id     uuid REFERENCES records(id) ON DELETE CASCADE,
    title         text,
    body          text NOT NULL,                 -- markdown: headings, tables, lists, checkboxes
    body_text     text,                          -- plaintext shadow for search
    content_format content_format NOT NULL DEFAULT 'markdown',
    kind          note_kind NOT NULL DEFAULT 'quick',
    tags          text[] NOT NULL DEFAULT '{}',
    pinned        boolean NOT NULL DEFAULT false,
    archived      boolean NOT NULL DEFAULT false,
    source        source_channel,
    original_text text,
    reviewed_at   timestamptz,
    created_at    timestamptz NOT NULL DEFAULT now(),
    updated_at    timestamptz NOT NULL DEFAULT now(),
    search_vector tsvector GENERATED ALWAYS AS (
        to_tsvector('english', coalesce(title,'') || ' ' || coalesce(body_text, body))
    ) STORED
);
CREATE INDEX notes_org_idx     ON notes (org_id);
CREATE INDEX notes_search_idx  ON notes USING gin (search_vector);
CREATE INDEX notes_tags_idx    ON notes USING gin (tags);
CREATE INDEX notes_project_idx ON notes (project_id);
CREATE INDEX notes_record_idx  ON notes (record_id);
CREATE INDEX notes_inbox_idx   ON notes (org_id) WHERE project_id IS NULL AND archived = false;
CREATE TRIGGER notes_touch BEFORE UPDATE ON notes
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- ---------- captures --------------------------------------------------------
CREATE TABLE captures (
    id             uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id         uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id       uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    raw_text       text,
    source         source_channel NOT NULL,
    received_at    timestamptz NOT NULL DEFAULT now(),
    interpretation jsonb,
    status         capture_status NOT NULL DEFAULT 'processed',
    result_kind    result_kind NOT NULL DEFAULT 'none',
    result_id      uuid
);
CREATE INDEX captures_org_idx ON captures (org_id, received_at);

-- ---------- attachments (polymorphic) ---------------------------------------
CREATE TABLE attachments (
    id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id     uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_type text NOT NULL,    -- 'note' | 'task' | 'capture' | 'receipt' | 'record'
    owner_id   uuid NOT NULL,
    file_url   text NOT NULL,
    mime_type  text,
    caption    text,
    created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX attachments_owner_idx ON attachments (owner_type, owner_id);

-- ---------- receipts (per project AND/OR per record) ------------------------
CREATE TABLE receipts (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE SET NULL,
    project_id   uuid REFERENCES projects(id) ON DELETE SET NULL,
    record_id    uuid REFERENCES records(id) ON DELETE CASCADE,   -- per-car / per-job P&L
    task_id      uuid REFERENCES tasks(id) ON DELETE SET NULL,
    amount       numeric(12,2),
    currency     text NOT NULL DEFAULT 'CAD',
    vendor       text,
    purchased_on date,
    category     text,
    note         text,
    source       source_channel,
    created_at   timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX receipts_project_idx ON receipts (project_id, purchased_on);
CREATE INDEX receipts_record_idx  ON receipts (record_id);

-- ---------- links (graph + deps + promote + workflow lineage) ---------------
CREATE TABLE links (
    id        uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id    uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    from_type text NOT NULL,
    from_id   uuid NOT NULL,
    to_type   text NOT NULL,
    to_id     uuid NOT NULL,
    relation  text NOT NULL,     -- references|related|blocks|depends_on|promoted_from|cloned_from
    created_at timestamptz NOT NULL DEFAULT now(),
    UNIQUE (from_type, from_id, to_type, to_id, relation)
);
CREATE INDEX links_from_idx ON links (from_type, from_id);
CREATE INDEX links_to_idx   ON links (to_type, to_id);

-- ---------- prompts (the Inbox feed: questions / flags / nudges) ------------
CREATE TABLE prompts (
    id            uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id        uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id      uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    type          prompt_type NOT NULL,
    text          text NOT NULL,
    relates_type  text,
    relates_id    uuid,
    status        prompt_status NOT NULL DEFAULT 'pending',
    surface_after timestamptz NOT NULL DEFAULT now(),
    answer_text   text,
    created_at    timestamptz NOT NULL DEFAULT now(),
    resolved_at   timestamptz
);
CREATE INDEX prompts_feed_idx ON prompts (owner_id, status, surface_after);

-- ---------- briefs_log (first-open-of-day brief) ----------------------------
CREATE TABLE briefs_log (
    id           uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id       uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    owner_id     uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    kind         brief_kind NOT NULL,
    generated_for date NOT NULL,
    task_ids     uuid[] NOT NULL DEFAULT '{}',
    payload      jsonb,
    shown_at     timestamptz,
    created_at   timestamptz NOT NULL DEFAULT now(),
    UNIQUE (owner_id, kind, generated_for)
);

-- ---------- channel_accounts [v2] -------------------------------------------
--  v1: one row per user, channel='app'. v2 adds telegram/slack/teams/outlook…
CREATE TABLE channel_accounts (
    id              uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    channel         channel_kind NOT NULL,
    external_id     text,
    preferred_for_push boolean NOT NULL DEFAULT false,
    created_at      timestamptz NOT NULL DEFAULT now(),
    UNIQUE (channel, external_id)
);

-- ============================================================================
--  ONBOARDING (v1): create a user + their personal org + membership atomically
--    INSERT organizations (name, kind) VALUES ($name||'''s space', 'personal');
--    INSERT users (name, email) VALUES (...);
--    INSERT memberships (user_id, org_id, role) VALUES ($u, $o, 'owner');
--    INSERT channel_accounts (user_id, channel) VALUES ($u, 'app');
--  Everything that user creates carries org_id = $o.  Complete isolation.
--
--  KEY QUERIES — all now begin "WHERE org_id = $org" (the tenant scope):
--    Daily brief:        ... AND status='open' AND scheduled_for <= current_date
--    Records pipeline:   SELECT * FROM records WHERE project_id=$p AND status='active'
--                        ORDER BY array_position(<stages>, stage);   -- the lot board
--    Per-record P&L:     SELECT sum(amount) FROM receipts WHERE record_id=$r;
--    New record intake:  read record_type.intake_checklist -> INSERT one task per item,
--                        each with record_id=$new.
--    Tasks page filters: WHERE project_id = ANY($projects)  /  record_id = $r  /
--                        timed: scheduled_for IS NOT NULL ORDER BY scheduled_for
--    Inbox feed:         unfiled notes (project_id IS NULL) UNION pending prompts.
-- ============================================================================
