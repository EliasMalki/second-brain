import type { CalendarProviderId } from "@/lib/calendar/types";

/**
 * Generic source-icon slot for external (read-only) event tiles. Maps a calendar
 * provider id to a MONOCHROME mark from the app's Tabler icon set (tinted by the
 * tile's text color) — keeping the one-icon-family and priority-only-saturated-
 * color rules. A future provider (Outlook) just adds a case here. Unknown → dot.
 */
export function SourceIcon({
  provider,
  size = 13,
}: {
  provider: CalendarProviderId;
  size?: number;
}) {
  if (provider === "google") {
    return (
      <i
        className="ti ti-brand-google srcicon"
        style={{ fontSize: size }}
        role="img"
        aria-label="Google Calendar"
      />
    );
  }
  return <span className="srcicon srcicon-fallback" aria-hidden="true" />;
}

/** Human label for a provider, used in the read-only detail popover. */
export function providerLabel(provider: CalendarProviderId): string {
  return provider === "google" ? "Google Calendar" : "External calendar";
}
