import { listNotes } from "@/lib/db/notes";
import { listProjects } from "@/lib/db/projects";
import { listAreas } from "@/lib/db/areas";
import { NotesWorkspace } from "./notes-workspace";
import type { FolderGroup } from "./workspace-types";

/**
 * Notes — the three-pane Apple-Notes-style workspace (org pane · list ·
 * editor). All data is fetched here (org-scoped via the db layer) and handed to
 * the client workspace. Folders are reused structure: areas group projects, and
 * each project is a folder; "/notes/[id]" stays as a deep-link read view used by
 * Inbox / Projects / Search.
 */
export default async function NotesPage() {
  const [notes, projects, areas] = await Promise.all([
    listNotes(), // all non-archived, pinned desc then updated_at desc
    listProjects(), // active + paused
    listAreas(),
  ]);

  // Group projects under their area's kind (Business / Personal); area-less
  // projects fall into a neutral "Projects" group — same buckets as the sidebar.
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
  const toFolders = (list: typeof projects) =>
    list.map((p) => ({ id: p.id, name: p.name, paused: p.status === "paused" }));

  const folderGroups: FolderGroup[] = [
    { label: "Business", projects: toFolders(buckets.business) },
    { label: "Personal", projects: toFolders(buckets.personal) },
    { label: "Projects", projects: toFolders(buckets.other) },
  ].filter((g) => g.projects.length > 0);

  return <NotesWorkspace initialNotes={notes} folderGroups={folderGroups} />;
}
