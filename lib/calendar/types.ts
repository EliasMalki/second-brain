/**
 * Calendar provider abstraction (v1 feature 3). The rest of the app talks to
 * this interface only — Google specifics live in GoogleCalendarProvider, so
 * adding Outlook/CalDAV in v2 is a new class + an enum value, nothing else.
 *
 * NormalizedEvent is deliberately provider-agnostic and carries NO token fields
 * and NO Google-isms (summary/htmlLink/attendees/etc are mapped away at the
 * provider boundary).
 */

export type CalendarProviderId = "google";

export type OAuthTokens = {
  accessToken: string;
  refreshToken: string | null; // null when the provider didn't (re)issue one
  expiresAt: string | null; // ISO
  scope: string | null;
};

/** One of dateTime (timed) or date (all-day) is set. */
export type EventTime = {
  dateTime: string | null; // RFC3339 with offset
  date: string | null; // YYYY-MM-DD (all-day)
};

export type NormalizedEvent = {
  id: string;
  title: string;
  start: EventTime;
  end: EventTime;
  allDay: boolean;
  location: string | null;
  status: "confirmed" | "tentative" | "cancelled";
  url: string | null;
};

/** A decrypted connection handed to the provider to list events. */
export type CalendarConnection = {
  id: string;
  provider: CalendarProviderId;
  externalCalendarId: string;
  accessToken: string; // decrypted
  refreshToken: string | null; // decrypted
  expiresAt: string | null;
  scope: string | null;
};

/**
 * Result of listing events. The provider refreshes the access token internally
 * when needed and returns the new tokens in `refreshed` for the read layer to
 * persist (DB writes stay out of the provider). It never throws on auth/API
 * failure — callers branch on `status`.
 */
export type ListEventsResult =
  | { status: "ok"; events: NormalizedEvent[]; refreshed?: OAuthTokens }
  | { status: "needs_reconnect" } // invalid_grant / revoked — user must re-consent
  | { status: "error"; message: string };

export interface CalendarProvider {
  readonly id: CalendarProviderId;

  /** Build the consent URL to redirect the user to (PKCE S256). */
  authUrl(args: { redirectUri: string; state: string; codeChallenge: string }): string;

  /** Exchange an authorization code for tokens. Throws only on a hard failure. */
  exchangeCode(args: {
    code: string;
    redirectUri: string;
    codeVerifier: string;
  }): Promise<OAuthTokens>;

  /** List events in [timeMinISO, timeMaxISO). Never throws — returns a status. */
  listEvents(args: {
    connection: CalendarConnection;
    timeMinISO: string;
    timeMaxISO: string;
    signal?: AbortSignal;
  }): Promise<ListEventsResult>;

  /** Best-effort token revoke on disconnect. */
  revoke(refreshToken: string): Promise<void>;
}
