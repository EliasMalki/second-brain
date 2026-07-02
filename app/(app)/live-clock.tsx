"use client";

import { useEffect, useState } from "react";

/** The greeting-row clock pill — ticks each minute in the browser's timezone. */
export function LiveClock() {
  const [label, setLabel] = useState("");

  useEffect(() => {
    const tick = () => {
      const d = new Date();
      let h = d.getHours();
      const m = d.getMinutes();
      const ap = h >= 12 ? "PM" : "AM";
      h = h % 12 || 12;
      setLabel(`${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")} ${ap}`);
    };
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <span className="h-clock" suppressHydrationWarning>
      {label || " "}
    </span>
  );
}
