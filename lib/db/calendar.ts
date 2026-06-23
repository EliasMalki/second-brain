import "server-only";

import { cache } from "react";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireUser } from "@/lib/auth";
import { getCurrentOrgId } from "@/lib/db/org";
import { createClient } from "@/lib/supabase/server";
import { createAdminClient } from "@/lib/supabase/admin";
import {
  decryptNullable,
  decryptToken,
  encryptNullable,
} from "@/lib/calendar/crypto";
import { getProvider } from "@/lib/calendar/registry";
import type { Database } from "@/lib/database.types";
import type {
  CalendarConnection,
  CalendarProviderId,
  NormalizedEvent,
  OAuthTokens,
} from "@/lib/calendar/types";

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

/** Disconnect: best-effort revoke at Google, then delete the local row. */
export async function disconnectCalendar(): Promise<void> {
  const user = await requireUser();
  const supabase = createClient();
  const { data: row } = await supabase
    .from("calendar_connections")
    .select("id, refresh_token_enc")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  if (!row) return;

  const refresh = decryptNullable(row.refresh_token_enc);
  if (refresh) await getProvider("google").revoke(refresh).catch(() => {});
  await supabase.from("calendar_connections").delete().eq("id", row.id);
}

// ---------------------------------------------------------------------------
// Read layer. getTodayEvents() NEVER throws — a calendar failure must not crash
// the shared (app) error boundary. State is one of:
//   disconnected | needs_reconnect | error | ok
// A row with revoked_at set = needs_reconnect (token died / disconnected by an
// invalid_grant). No row = disconnected. cache() de-dupes within one render.
// ---------------------------------------------------------------------------

export type ConnectionStatus = "disconnected" | "connected" | "needs_reconnect";

export type TodayCalendar =
  | { status: "disconnected" }
  | { status: "needs_reconnect" }
  | { status: "error" }
  | { status: "ok"; events: NormalizedEvent[]; timezone: string };

/**
 * Range read result for the Calendar view. Same fail-soft union as TodayCalendar
 * plus the source `provider` on the ok branch, so the calendar can tag each event
 * with its origin (Google today; Outlook later) for the generic source-icon slot.
 */
export type RangeCalendar =
  | { status: "disconnected" }
  | { status: "needs_reconnect" }
  | { status: "error" }
  | {
      status: "ok";
      events: NormalizedEvent[];
      timezone: string;
      provider: CalendarProviderId;
    };

const FETCH_TIMEOUT_MS = 4000;

const getConnectionRow = cache(async () => {
  const user = await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from("calendar_connections")
    .select("*")
    .eq("user_id", user.id)
    .eq("provider", "google")
    .maybeSingle();
  return data;
});

export const getUserTimezone = cache(async (): Promise<string> => {
  const user = await requireUser();
  const supabase = createClient();
  const { data } = await supabase
    .from("users")
    .select("settings")
    .eq("id", user.id)
    .maybeSingle();
  const settings = (data?.settings ?? {}) as Record<string, unknown>;
  const tz = typeof settings.timezone === "string" ? settings.timezone : "";
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: tz || "Etc/UTC" });
    return tz || "Etc/UTC";
  } catch {
    return "Etc/UTC"; // malformed tz in settings — don't shift "today" to server time
  }
});

/** For the settings page: is the user connected, disconnected, or stale? */
export async function getConnectionStatus(): Promise<ConnectionStatus> {
  const row = await getConnectionRow();
  if (!row) return "disconnected";
  return row.revoked_at ? "needs_reconnect" : "connected";
}

type ConnectionRow = Database["public"]["Tables"]["calendar_connections"]["Row"];

/**
 * Core: decrypt the connection, fetch today's events, persist any refreshed
 * token / needs_reconnect using the SAME client the caller passed (anon for the
 * in-app path, service-role for the nightly brief). Never throws.
 */
async function runListEvents(
  supabase: SupabaseClient<Database>,
  row: ConnectionRow,
  timezone: string,
  window: { timeMinISO: string; timeMaxISO: string },
): Promise<TodayCalendar> {
  if (row.revoked_at) return { status: "needs_reconnect" };

  const { timeMinISO, timeMaxISO } = window;
  const connection: CalendarConnection = {
    id: row.id,
    provider: "google",
    externalCalendarId: row.external_calendar_id,
    accessToken: row.access_token_enc ? decryptToken(row.access_token_enc) : "",
    refreshToken: decryptNullable(row.refresh_token_enc),
    expiresAt: row.expires_at,
    scope: row.scope,
  };

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
  let result;
  try {
    result = await getProvider("google").listEvents({
      connection,
      timeMinISO,
      timeMaxISO,
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timer);
  }

  if (result.status === "needs_reconnect") {
    await supabase
      .from("calendar_connections")
      .update({ revoked_at: new Date().toISOString() })
      .eq("id", row.id)
      .then(() => {}, () => {});
    return { status: "needs_reconnect" };
  }
  if (result.status === "error") return { status: "error" };

  if (result.refreshed) {
    const refreshed: OAuthTokens = result.refreshed;
    await supabase
      .from("calendar_connections")
      .update({
        access_token_enc: encryptNullable(refreshed.accessToken),
        expires_at: refreshed.expiresAt,
        ...(refreshed.scope ? { scope: refreshed.scope } : {}),
      })
      .eq("id", row.id)
      .then(() => {}, () => {});
  }
  return { status: "ok", events: result.events, timezone };
}

/** In-app Today view (session user, anon RLS client). */
export const getTodayEvents = cache(async (): Promise<TodayCalendar> => {
  try {
    const row = await getConnectionRow();
    if (!row) return { status: "disconnected" };
    const timezone = await getUserTimezone();
    return await runListEvents(createClient(), row, timezone, todayWindow(timezone));
  } catch {
    return { status: "error" };
  }
});

/**
 * Calendar-view read: events in [startDateISO 00:00, endDateISO 24:00) in the
 * user's tz, as one fetch. Reuses the exact runListEvents path (provider call,
 * token-refresh persistence, fail-soft status). startDateISO/endDateISO are
 * inclusive calendar days (YYYY-MM-DD); the window covers the whole end day.
 * Never throws — the calendar still renders app items if Google is down.
 */
export const getEventsInRange = cache(
  async (startDateISO: string, endDateISO: string): Promise<RangeCalendar> => {
    try {
      const row = await getConnectionRow();
      if (!row) return { status: "disconnected" };
      const timezone = await getUserTimezone();
      const window = rangeWindow(startDateISO, endDateISO, timezone);
      const res = await runListEvents(createClient(), row, timezone, window);
      return res.status === "ok" ? { ...res, provider: "google" } : res;
    } catch {
      return { status: "error" };
    }
  },
);

/**
 * Service-role variant for the nightly email brief (no user session). Reads the
 * given user's connection + tz with the admin client, manually scoped by
 * user_id. Reuses the same provider/crypto/persist path as the in-app read.
 */
export async function getTodayEventsForUser(userId: string): Promise<TodayCalendar> {
  try {
    const admin = createAdminClient();
    const { data: row } = await admin
      .from("calendar_connections")
      .select("*")
      .eq("user_id", userId)
      .eq("provider", "google")
      .maybeSingle();
    if (!row) return { status: "disconnected" };

    const { data: u } = await admin
      .from("users")
      .select("settings")
      .eq("id", userId)
      .maybeSingle();
    const settings = (u?.settings ?? {}) as Record<string, unknown>;
    let tz = typeof settings.timezone === "string" ? settings.timezone : "Etc/UTC";
    try {
      new Intl.DateTimeFormat("en-US", { timeZone: tz });
    } catch {
      tz = "Etc/UTC";
    }

    return await runListEvents(admin, row, tz, todayWindow(tz));
  } catch {
    return { status: "error" };
  }
}

// --- timezone windowing (DST-aware, no library) ----------------------------

/** [today 00:00, tomorrow 00:00) in the given IANA tz, as UTC ISO instants. */
function todayWindow(timeZone: string): { timeMinISO: string; timeMaxISO: string } {
  const { y, m, d } = ymdInTz(new Date(), timeZone);
  const start = zonedMidnightUtc(y, m, d, timeZone);
  // advance one calendar day (handles month/year rollover) then re-resolve its
  // local midnight, so a 23h/25h DST day is windowed correctly.
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  const end = zonedMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { timeMinISO: start.toISOString(), timeMaxISO: end.toISOString() };
}

/**
 * [startDate 00:00, endDate+1 00:00) in the given tz, as UTC ISO instants —
 * the multi-day generalization of todayWindow. Inputs are YYYY-MM-DD; the end
 * day is fully included (we advance one calendar day past it, DST-corrected).
 */
function rangeWindow(
  startDateISO: string,
  endDateISO: string,
  timeZone: string,
): { timeMinISO: string; timeMaxISO: string } {
  const [sy, sm, sd] = startDateISO.split("-").map(Number);
  const [ey, em, ed] = endDateISO.split("-").map(Number);
  const start = zonedMidnightUtc(sy, sm, sd, timeZone);
  const next = new Date(Date.UTC(ey, em - 1, ed + 1));
  const end = zonedMidnightUtc(
    next.getUTCFullYear(),
    next.getUTCMonth() + 1,
    next.getUTCDate(),
    timeZone,
  );
  return { timeMinISO: start.toISOString(), timeMaxISO: end.toISOString() };
}

function ymdInTz(date: Date, timeZone: string): { y: number; m: number; d: number } {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(date);
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  return { y: val("year"), m: val("month"), d: val("day") };
}

/** The UTC instant of local midnight on y-m-d in the tz (DST-corrected). */
function zonedMidnightUtc(y: number, m: number, d: number, timeZone: string): Date {
  const naive = Date.UTC(y, m - 1, d, 0, 0, 0);
  const off1 = tzOffsetMs(naive, timeZone);
  let utc = naive - off1;
  const off2 = tzOffsetMs(utc, timeZone);
  if (off2 !== off1) utc = naive - off2; // correct across a DST boundary
  return new Date(utc);
}

/** Offset (wall-clock minus UTC, in ms) the tz has at a given UTC instant. */
function tzOffsetMs(utcMs: number, timeZone: string): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).formatToParts(new Date(utcMs));
  const val = (t: string) => Number(parts.find((p) => p.type === t)?.value);
  let hour = val("hour");
  if (hour === 24) hour = 0; // some engines emit 24 for midnight
  const asUtc = Date.UTC(val("year"), val("month") - 1, val("day"), hour, val("minute"), val("second"));
  return asUtc - utcMs;
}
