import "server-only";

import { requireUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/db/org";
import { createClient } from "@/lib/supabase/server";
import { encryptNullable } from "@/lib/calendar/crypto";
import type { CalendarProviderId, OAuthTokens } from "@/lib/calendar/types";

/**
 * Calendar connection persistence (v1 feature 3). Tokens are AES-encrypted
 * here before they touch the DB (lib/calendar/crypto.ts) and are never returned
 * to anything client-facing. All access is the caller's own row (user-scoped
 * RLS); org_id is still set for query-layer consistency.
 *
 * Read access (getTodayEvents) lives in the same module — added in the next step.
 */

/**
 * Upsert the user's connection after OAuth. Preserves an existing refresh token
 * when Google omits one on re-consent (it only re-issues with prompt=consent,
 * and even then not always), so we never null out a working refresh token.
 */
export async function saveConnection(input: {
  provider: CalendarProviderId;
  tokens: OAuthTokens;
  timezone?: string | null;
}): Promise<void> {
  const user = await requireUser();
  const orgId = await getCurrentOrgId();
  const supabase = createClient();

  let refreshEnc = encryptNullable(input.tokens.refreshToken);
  if (!refreshEnc) {
    const { data: existing } = await supabase
      .from("calendar_connections")
      .select("refresh_token_enc")
      .eq("user_id", user.id)
      .eq("provider", input.provider)
      .maybeSingle();
    refreshEnc = existing?.refresh_token_enc ?? null;
  }

  const { error } = await supabase.from("calendar_connections").upsert(
    {
      org_id: orgId,
      user_id: user.id,
      provider: input.provider,
      external_calendar_id: "primary",
      access_token_enc: encryptNullable(input.tokens.accessToken),
      refresh_token_enc: refreshEnc,
      expires_at: input.tokens.expiresAt,
      scope: input.tokens.scope,
      revoked_at: null,
    },
    { onConflict: "org_id,user_id,provider" },
  );
  if (error) throw new Error(`saveConnection: ${error.message}`);

  if (input.timezone) await saveTimezone(input.timezone);
}

/** Persist the user's IANA timezone into users.settings (merge, no overwrite). */
export async function saveTimezone(timezone: string): Promise<void> {
  const user = await requireUser();
  const supabase = createClient();

  const { data } = await supabase
    .from("users")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();

  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  if (settings.timezone === timezone) return;

  const { error } = await supabase
    .from("users")
    .update({ settings: { ...settings, timezone } })
    .eq("id", user.id);
  if (error) throw new Error(`saveTimezone: ${error.message}`);
}
