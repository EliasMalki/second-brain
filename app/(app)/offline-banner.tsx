"use client";

import { useEffect, useState } from "react";

/** Clear "you are offline" indicator (BUILD_SPEC §6). */
export function OfflineBanner() {
  const [offline, setOffline] = useState(false);

  useEffect(() => {
    setOffline(!navigator.onLine);
    const on = () => setOffline(false);
    const off = () => setOffline(true);
    window.addEventListener("online", on);
    window.addEventListener("offline", off);
    return () => {
      window.removeEventListener("online", on);
      window.removeEventListener("offline", off);
    };
  }, []);

  if (!offline) return null;
  return (
    <div className="offline-banner" role="status">
      <i className="ti ti-wifi-off" aria-hidden="true" /> Offline — showing
      last-loaded data. Captures still work and will sync when you reconnect.
    </div>
  );
}
