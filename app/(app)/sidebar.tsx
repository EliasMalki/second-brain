"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

/**
 * Left sidebar shell (mockup: desktop_today_brief). Search → primary nav →
 * projects grouped by area → footer (account/export/sign out). A client
 * component purely so `usePathname()` can light the active item; all data is
 * fetched server-side in the layout and passed in.
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

  const isActive = (href: string) =>
    href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(`${href}/`);

  return (
    <aside className="sidebar">
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

      <div className="sidebar-foot">
        <span className="email" title={userEmail}>
          {userEmail}
        </span>
        <div className="sidebar-foot-actions">
          <a href="/export" className="btn-pill" title="Download everything as a zip">
            <i className="ti ti-download" aria-hidden="true" />
            Export
          </a>
          <Link href="/admin/logs" className="btn-pill" title="Nightly brief health">
            <i className="ti ti-activity" aria-hidden="true" />
            Logs
          </Link>
          <form action="/auth/signout" method="post">
            <button type="submit" className="btn-pill">
              Sign out
            </button>
          </form>
        </div>
      </div>
    </aside>
  );
}
