"use client";

/**
 * Starts the OAuth flow, passing the browser's IANA timezone so the callback
 * can store it (calendar events are timezoned; the app otherwise has no tz).
 */
export function ConnectCalendarButton({ label }: { label?: string }) {
  function connect() {
    let tz = "";
    try {
      tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    } catch {
      tz = "";
    }
    const q = tz ? `?tz=${encodeURIComponent(tz)}` : "";
    window.location.href = `/api/calendar/connect${q}`;
  }

  return (
    <button type="button" className="btn btn-primary" onClick={connect}>
      <i className="ti ti-brand-google" aria-hidden="true" />{" "}
      {label ?? "Connect Google Calendar"}
    </button>
  );
}
