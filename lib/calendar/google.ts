import "server-only";

import { serverEnv } from "@/lib/env";
import type {
  CalendarConnection,
  CalendarProvider,
  ListEventsResult,
  NormalizedEvent,
  OAuthTokens,
} from "./types";

/**
 * Google Calendar provider (read-only). Bare fetch, no SDK. Owns every Google
 * specific: OAuth endpoints, the events.list query shape, token refresh, and
 * the invalid_grant → needs_reconnect mapping. Nothing here leaks outside the
 * CalendarProvider interface.
 */

const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const REVOKE_URL = "https://oauth2.googleapis.com/revoke";
// Least privilege: read events on the primary calendar, nothing more.
const SCOPE = "https://www.googleapis.com/auth/calendar.events.readonly";

function eventsUrl(calendarId: string): string {
  return `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(
    calendarId,
  )}/events`;
}

type GoogleEvent = {
  id: string;
  status?: string;
  summary?: string;
  location?: string;
  htmlLink?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
};

function mapEvent(item: GoogleEvent): NormalizedEvent {
  return {
    id: item.id,
    title: item.summary?.trim() || "(no title)",
    start: { dateTime: item.start?.dateTime ?? null, date: item.start?.date ?? null },
    end: { dateTime: item.end?.dateTime ?? null, date: item.end?.date ?? null },
    allDay: Boolean(item.start?.date),
    location: item.location ?? null,
    status:
      item.status === "tentative"
        ? "tentative"
        : item.status === "cancelled"
          ? "cancelled"
          : "confirmed",
    url: item.htmlLink ?? null,
  };
}

type RefreshResult =
  | { kind: "ok"; accessToken: string; expiresAt: string; scope: string | null }
  | { kind: "needs_reconnect" };

export class GoogleCalendarProvider implements CalendarProvider {
  readonly id = "google" as const;

  authUrl(args: { redirectUri: string; state: string; codeChallenge: string }): string {
    const params = new URLSearchParams({
      client_id: serverEnv.googleClientId(),
      redirect_uri: args.redirectUri,
      response_type: "code",
      scope: SCOPE,
      access_type: "offline", // ask for a refresh token
      prompt: "consent", // re-issue the refresh token on every consent
      include_granted_scopes: "true",
      state: args.state,
      code_challenge: args.codeChallenge,
      code_challenge_method: "S256",
    });
    return `${AUTH_URL}?${params.toString()}`;
  }

  async exchangeCode(args: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OAuthTokens> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        code: args.code,
        client_id: serverEnv.googleClientId(),
        client_secret: serverEnv.googleClientSecret(),
        redirect_uri: args.redirectUri,
        grant_type: "authorization_code",
        code_verifier: args.codeVerifier,
      }).toString(),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      // Never log the code/secret; surface a generic message.
      throw new Error(`google token exchange failed (${res.status})`);
    }
    return {
      accessToken: data.access_token,
      refreshToken: data.refresh_token ?? null,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      scope: data.scope ?? null,
    };
  }

  private async refresh(
    refreshToken: string,
    signal?: AbortSignal,
  ): Promise<RefreshResult> {
    const res = await fetch(TOKEN_URL, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: serverEnv.googleClientId(),
        client_secret: serverEnv.googleClientSecret(),
        refresh_token: refreshToken,
        grant_type: "refresh_token",
      }).toString(),
      signal,
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok || data.error) {
      // invalid_grant = revoked/expired refresh token → user must reconnect.
      if (data.error === "invalid_grant") return { kind: "needs_reconnect" };
      throw new Error(`google token refresh failed (${res.status})`);
    }
    return {
      kind: "ok",
      accessToken: data.access_token,
      expiresAt: new Date(Date.now() + (data.expires_in ?? 3600) * 1000).toISOString(),
      scope: data.scope ?? null,
    };
  }

  async listEvents(args: {
    connection: CalendarConnection;
    timeMinISO: string;
    timeMaxISO: string;
    signal?: AbortSignal;
  }): Promise<ListEventsResult> {
    const { connection } = args;
    let accessToken = connection.accessToken;
    let refreshed: OAuthTokens | undefined;

    const expired =
      !connection.expiresAt ||
      new Date(connection.expiresAt).getTime() <= Date.now() + 60_000; // 60s skew

    try {
      if (expired) {
        if (!connection.refreshToken) return { status: "needs_reconnect" };
        const r = await this.refresh(connection.refreshToken, args.signal);
        if (r.kind === "needs_reconnect") return { status: "needs_reconnect" };
        accessToken = r.accessToken;
        refreshed = {
          accessToken: r.accessToken,
          refreshToken: connection.refreshToken,
          expiresAt: r.expiresAt,
          scope: r.scope ?? connection.scope,
        };
      }

      const url = new URL(eventsUrl(connection.externalCalendarId));
      url.searchParams.set("timeMin", args.timeMinISO);
      url.searchParams.set("timeMax", args.timeMaxISO);
      url.searchParams.set("singleEvents", "true"); // expand recurring
      url.searchParams.set("orderBy", "startTime");
      // Up to 250 so a full month window isn't silently truncated (today's view
      // never approaches it). A busier month would need pagination — a later add.
      url.searchParams.set("maxResults", "250");

      let res = await fetch(url, {
        headers: { Authorization: `Bearer ${accessToken}` },
        signal: args.signal,
      });

      // Access token rejected mid-flight: refresh once and retry.
      if (res.status === 401 && connection.refreshToken && !refreshed) {
        const r = await this.refresh(connection.refreshToken, args.signal);
        if (r.kind === "needs_reconnect") return { status: "needs_reconnect" };
        accessToken = r.accessToken;
        refreshed = {
          accessToken: r.accessToken,
          refreshToken: connection.refreshToken,
          expiresAt: r.expiresAt,
          scope: r.scope ?? connection.scope,
        };
        res = await fetch(url, {
          headers: { Authorization: `Bearer ${accessToken}` },
          signal: args.signal,
        });
      }

      if (!res.ok) {
        if (res.status === 401 || res.status === 403) return { status: "needs_reconnect" };
        return { status: "error", message: `events.list ${res.status}` };
      }

      const data = (await res.json()) as { items?: GoogleEvent[] };
      const events = (data.items ?? [])
        .map(mapEvent)
        .filter((e) => e.status !== "cancelled");
      return { status: "ok", events, refreshed };
    } catch (e) {
      const message = e instanceof Error ? e.message : "calendar fetch failed";
      return { status: "error", message };
    }
  }

  async revoke(refreshToken: string): Promise<void> {
    await fetch(`${REVOKE_URL}?token=${encodeURIComponent(refreshToken)}`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
    }).catch(() => {
      // best-effort — the local row is cleared regardless
    });
  }
}
