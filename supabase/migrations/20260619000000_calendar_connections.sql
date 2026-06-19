-- ============================================================================
--  Calendar connections — OAuth token storage for read-only calendar sync
-- ============================================================================
--  v1 feature 3 (Google Calendar, read-only). The v3 schema had no home for
--  OAuth tokens (channel_accounts is messaging-only), so this is the one
--  additive table the feature needs.
--
--  One row per user per provider (UNIQUE(org_id,user_id,provider)). Tokens are
--  stored APP-LAYER ENCRYPTED (AES-256-GCM via lib/calendar/crypto.ts) in the
--  *_enc columns — never plaintext, never sent to the browser. RLS is
--  USER-scoped (not org-scoped): a calendar is personal, so even a future
--  multi-member org must not let org-mates read each other's tokens. Mirrors
--  the channel_accounts_self policy.
--
--  provider is an enum so Outlook/CalDAV slot in later (a v2 ALTER TYPE) with
--  no table change. external_calendar_id defaults to the provider's primary
--  calendar sentinel ('primary' for Google).
-- ============================================================================

CREATE TYPE calendar_provider AS ENUM ('google');

CREATE TABLE calendar_connections (
    id                   uuid PRIMARY KEY DEFAULT gen_random_uuid(),
    org_id               uuid NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
    user_id              uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    provider             calendar_provider NOT NULL,
    external_calendar_id text NOT NULL DEFAULT 'primary',
    access_token_enc     text,             -- AES-256-GCM ciphertext (short-lived)
    refresh_token_enc    text,             -- AES-256-GCM ciphertext (long-lived)
    expires_at           timestamptz,      -- access-token expiry; NULL => refresh
    scope                text,             -- granted OAuth scopes (space-separated)
    revoked_at           timestamptz,      -- set on disconnect / invalid_grant
    created_at           timestamptz NOT NULL DEFAULT now(),
    updated_at           timestamptz NOT NULL DEFAULT now(),
    UNIQUE (org_id, user_id, provider)
);

CREATE INDEX calendar_connections_user_idx ON calendar_connections (user_id);
CREATE INDEX calendar_connections_org_idx  ON calendar_connections (org_id);

CREATE TRIGGER calendar_connections_touch BEFORE UPDATE ON calendar_connections
    FOR EACH ROW EXECUTE FUNCTION touch_updated_at();

-- User-scoped RLS: a user can see/manage only their OWN calendar connection.
ALTER TABLE public.calendar_connections ENABLE ROW LEVEL SECURITY;
CREATE POLICY calendar_connections_self ON public.calendar_connections
  FOR ALL TO authenticated
  USING      (user_id = (select auth.uid()))
  WITH CHECK (user_id = (select auth.uid()));
