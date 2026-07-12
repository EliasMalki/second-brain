"use client";

import { useEffect } from "react";
import { SourceIcon, providerLabel } from "./source-icon";
import { useDismissable } from "../use-dismissable";
import type { CalendarProviderId, NormalizedEvent } from "@/lib/calendar/types";

/**
 * Read-only detail for an external calendar event. External events are never
 * editable or movable in-app (write-back is a deliberate later feature), so this
 * is a plain card — the source mark + a deep link back to the provider, nothing
 * actionable. Esc / backdrop click closes it.
 */

function fmtTime(iso: string, tz: string): string {
  return new Date(iso).toLocaleTimeString(undefined, {
    timeZone: tz,
    hour: "numeric",
    minute: "2-digit",
  });
}

function fmtDate(iso: string, tz: string, allDay: boolean): string {
  // all-day dates are plain YYYY-MM-DD (no tz); timed are instants.
  const d = allDay ? new Date(`${iso}T00:00:00`) : new Date(iso);
  return d.toLocaleDateString(undefined, {
    weekday: "short",
    month: "short",
    day: "numeric",
    ...(allDay ? {} : { timeZone: tz }),
  });
}

function whenLabel(event: NormalizedEvent, tz: string): string {
  if (event.allDay) {
    const start = event.start.date ?? "";
    return `${fmtDate(start, tz, true)} · All day`;
  }
  const s = event.start.dateTime;
  const e = event.end.dateTime;
  if (!s) return "";
  const datePart = fmtDate(s, tz, false);
  const timePart = e ? `${fmtTime(s, tz)} – ${fmtTime(e, tz)}` : fmtTime(s, tz);
  return `${datePart} · ${timePart}`;
}

export function ExternalEventPopover({
  event,
  provider,
  tz,
  onClose,
}: {
  event: NormalizedEvent;
  provider: CalendarProviderId;
  tz: string;
  onClose: () => void;
}) {
  // exit mirrors the entrance (§7): requestClose plays it, then unmounts
  const { closing, requestClose } = useDismissable(onClose);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") requestClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [requestClose]);

  return (
    <div
      className={`cal-pop-backdrop${closing ? " is-closing" : ""}`}
      onClick={requestClose}
    >
      <div
        className={`cal-pop${closing ? " is-closing" : ""}`}
        role="dialog"
        aria-label="Event detail"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="cal-pop-head">
          <span className="cal-pop-src">
            <SourceIcon provider={provider} size={14} />
            {providerLabel(provider)}
          </span>
          <button
            type="button"
            className="panel-x"
            onClick={requestClose}
            aria-label="Close"
            title="Close"
          >
            <i className="ti ti-x" aria-hidden="true" />
          </button>
        </div>

        <h3 className="cal-pop-title">{event.title}</h3>

        <div className="cal-pop-row">
          <i className="ti ti-clock" aria-hidden="true" />
          <span>{whenLabel(event, tz)}</span>
        </div>
        {event.location ? (
          <div className="cal-pop-row">
            <i className="ti ti-map-pin" aria-hidden="true" />
            <span>{event.location}</span>
          </div>
        ) : null}

        <p className="cal-pop-note">
          <i className="ti ti-lock" aria-hidden="true" /> Read-only — from your{" "}
          {providerLabel(provider)}.
        </p>

        {event.url ? (
          <a
            className="cal-pop-link"
            href={event.url}
            target="_blank"
            rel="noopener noreferrer"
          >
            <i className="ti ti-external-link" aria-hidden="true" />
            Open in {providerLabel(provider)}
          </a>
        ) : null}
      </div>
    </div>
  );
}
