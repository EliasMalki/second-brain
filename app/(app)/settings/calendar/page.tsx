import { getConnectionStatus } from "@/lib/db/calendar";
import { ConnectCalendarButton } from "./connect-button";
import { disconnectCalendarAction } from "./actions";

/**
 * Calendar settings — connect / reconnect / disconnect Google Calendar
 * (read-only). The OAuth callback redirects back here with ?connected / ?error.
 */
export default async function CalendarSettingsPage({
  searchParams,
}: {
  searchParams: { connected?: string; error?: string };
}) {
  const status = await getConnectionStatus();
  const justConnected = searchParams.connected === "1";
  const error = searchParams.error;

  const errorText =
    error === "denied"
      ? "Connection cancelled."
      : error === "state"
        ? "The connection request expired or didn't match — please try again."
        : error
          ? "Couldn't connect — please try again."
          : null;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Calendar</span>
        <span className="view-sub">Google Calendar · read-only</span>
      </div>

      {justConnected ? (
        <div className="cal-banner ok" role="status">
          <i className="ti ti-check" aria-hidden="true" /> Google Calendar connected.
        </div>
      ) : null}
      {errorText ? (
        <div className="cal-banner err" role="alert">
          <i className="ti ti-alert-triangle" aria-hidden="true" /> {errorText}
        </div>
      ) : null}

      <div className="card">
        <p className="card-label">
          <i className="ti ti-calendar" aria-hidden="true" /> Google Calendar
        </p>
        <p style={{ fontSize: 13, color: "var(--color-text-secondary)" }}>
          Read-only. Your day&apos;s events show on the home screen and in the daily
          brief. We never edit your calendar, and tokens are stored encrypted.
        </p>

        <div className="form-actions" style={{ marginTop: "var(--space-3)" }}>
          {status === "connected" ? (
            <>
              <span className="cal-status ok">
                <i className="ti ti-circle-check-filled" aria-hidden="true" /> Connected
              </span>
              <form action={disconnectCalendarAction}>
                <button type="submit" className="btn">
                  Disconnect
                </button>
              </form>
            </>
          ) : status === "needs_reconnect" ? (
            <>
              <span className="cal-status warn">
                <i className="ti ti-alert-triangle" aria-hidden="true" /> Reconnect needed
              </span>
              <ConnectCalendarButton label="Reconnect" />
              <form action={disconnectCalendarAction}>
                <button type="submit" className="btn">
                  Remove
                </button>
              </form>
            </>
          ) : (
            <ConnectCalendarButton />
          )}
        </div>
      </div>
    </>
  );
}
