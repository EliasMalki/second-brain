import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { listInbox } from "@/lib/db/inbox";
import { getDisplayName } from "@/lib/db/settings";
import { OfflineBanner } from "./offline-banner";
import { Sidebar } from "./sidebar";
import { ComposerDock } from "./composer-dock";
import { ViewportFix } from "./viewport-fix";

/**
 * Shell for every authenticated page: the left sidebar + the content pane.
 * Routes outside this group (/login, /auth/*) stay bare.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, displayName, projects, areas, inbox] = await Promise.all([
    requireUser(),
    getDisplayName(),
    listProjects(), // active + paused, not archived
    ensureDefaultAreas(),
    listInbox(),
  ]);

  // Group projects under their area's kind (Business / Personal); area-less
  // projects fall into a neutral "Projects" group. Order: Business, Personal,
  // then Other — matching the mockup sidebar.
  const areaKind = new Map(areas.map((a) => [a.id, a.kind]));
  const buckets: Record<"business" | "personal" | "other", typeof projects> = {
    business: [],
    personal: [],
    other: [],
  };
  for (const p of projects) {
    const kind = p.area_id ? areaKind.get(p.area_id) : undefined;
    buckets[kind ?? "other"].push(p);
  }

  const toLinks = (list: typeof projects) =>
    list.map((p) => ({
      id: p.id,
      name: p.name,
      paused: p.status === "paused",
      color: p.color,
    }));

  const groups = [
    { label: "Business", projects: toLinks(buckets.business) },
    { label: "Personal", projects: toLinks(buckets.personal) },
    { label: "Projects", projects: toLinks(buckets.other) },
  ].filter((g) => g.projects.length > 0);

  return (
    <>
      <ViewportFix />
      {/* frame owns the viewport height; the banner (when offline) takes its
          natural height and the shell flexes into the rest — so it never pushes
          the bottom-docked composer off-screen. */}
      <div className="app-frame">
        <OfflineBanner />
        <div className="app-shell">
          <Sidebar
            userEmail={user.email ?? ""}
            userName={displayName ?? ""}
            inboxCount={inbox.length}
            groups={groups}
          />
          <main className="app-main">
            <div className="app-content">{children}</div>
            <ComposerDock />
          </main>
        </div>
      </div>
    </>
  );
}
