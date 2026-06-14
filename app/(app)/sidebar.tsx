"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { AccountMenu } from "./account-menu";

/**
 * Left sidebar shell (mockup: desktop_today_brief). Search → primary nav →
 * projects grouped by area → the account card footer (AccountMenu: appearance /
 * export / logs / sign out). A client component purely so `usePathname()` can
 * light the active item; all data is fetched server-side in the layout.
 */

type ProjectLink = { id: string; name: string; paused: boolean };
type ProjectGroup = { label: string; projects: ProjectLink[] };

type NavItem = { href: string; label: string; icon: string; counted?: boolean };

const NAV: NavItem[] = [
  { href: "/inbox", label: "Inbox", icon: "ti-inbox", counted: true },
  { href: "/", label: "Today", icon: "ti-sun" },
  { href: "/week", label: "This week", icon: "ti-calendar-week" },
  { href: "/tasks", label: "Tasks", icon: "ti-checkbox" },
  { href: "/recurrences", label: "Recurring", icon: "ti-refresh" },
  { href: "/notes", label: "Notes", icon: "ti-note" },
  { href: "/projects", label: "Projects", icon: "ti-folders" },
];

export function Sidebar({
  userEmail,
  inboxCount,
  groups,
}: {
  userEmail: string;
  inboxCount: number;
  groups: ProjectGroup[];
}) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);

  // Close the mobile drawer whenever the route changes (a nav tap navigates).
  useEffect(() => {
    setOpen(false);
  }, [pathname]);

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <>
      <button
        type="button"
        className="sidebar-toggle"
        onClick={() => setOpen(true)}
        aria-label="Open menu"
      >
        <i className="ti ti-menu-2" aria-hidden="true" />
      </button>
      {open ? (
        <div
          className="sidebar-backdrop"
          onClick={() => setOpen(false)}
          aria-hidden="true"
        />
      ) : null}
      <aside className={open ? "sidebar open" : "sidebar"}>
      <form method="get" action="/search" className="sidebar-search">
        <i className="ti ti-search" aria-hidden="true" />
        <input
          type="search"
          name="q"
          placeholder="Search your brain…"
          aria-label="Search notes and tasks"
        />
      </form>

      <nav>
        {NAV.map((item) => (
          <Link
            key={item.href}
            href={item.href}
            className={isActive(item.href) ? "nav-item on" : "nav-item"}
          >
            <i className={`ti ${item.icon}`} aria-hidden="true" />
            {item.label}
            {item.counted && inboxCount > 0 ? (
              <span className="nav-count">{inboxCount}</span>
            ) : null}
          </Link>
        ))}
      </nav>

      {groups.map((group) => (
        <div key={group.label}>
          <p className="nav-group">{group.label}</p>
          {group.projects.map((p) => (
            <Link
              key={p.id}
              href={`/projects/${p.id}`}
              className={
                "proj-item" +
                (pathname === `/projects/${p.id}` ? " on" : "") +
                (p.paused ? " paused" : "")
              }
            >
              {p.paused ? (
                <i className="ti ti-player-pause" aria-hidden="true" />
              ) : (
                <span className="dot" aria-hidden="true" />
              )}
              {p.name}
            </Link>
          ))}
        </div>
      ))}

      <AccountMenu userEmail={userEmail} />
      </aside>
    </>
  );
}
