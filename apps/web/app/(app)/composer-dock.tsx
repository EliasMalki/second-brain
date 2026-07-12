"use client";

import { usePathname } from "next/navigation";
import { CaptureBox } from "./capture-box";

/**
 * The floating capture composer, docked at the bottom of every page — EXCEPT
 * Home, which renders the capture as its hero (one capture surface per screen,
 * per the command-center design). A client component only so usePathname() can
 * suppress the dock on "/".
 */
export function ComposerDock() {
  const pathname = usePathname();
  if (pathname === "/") return null;
  return (
    <div className="composer-dock">
      <CaptureBox />
    </div>
  );
}
