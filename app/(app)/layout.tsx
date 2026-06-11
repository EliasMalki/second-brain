import { requireUser } from "@/lib/auth";
import { listProjects } from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { listInbox } from "@/lib/db/inbox";
import { OfflineBanner } from "./offline-banner";
import { Sidebar } from "./sidebar";

/**
 * Shell for every authenticated page: the left sidebar + the content pane.
 * Routes outside this group (/login, /auth/*) stay bare.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const [user, projects, areas, inbox] = await Promise.all([
    requireUser(),
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
    list.map((p) => ({ id: p.id, name: p.name, paused: p.status === "paused" }));

  const groups = [
    { label: "Business", projects: toLinks(buckets.business) },
    { label: "Personal", projects: toLinks(buckets.personal) },
    { label: "Projects", projects: toLinks(buckets.other) },
  ].filter((g) => g.projects.length > 0);

  return (
    <>
      <OfflineBanner />
      <div className="app-shell">
        <Sidebar
          userEmail={user.email ?? ""}
          inboxCount={inbox.length}
          groups={groups}
        />
        <main className="app-main">
          <div className="app-content">{children}</div>
        </main>
      </div>
    </>
  );
}
