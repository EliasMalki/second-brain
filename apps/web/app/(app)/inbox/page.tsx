import { listInbox } from "@/lib/db/inbox";
import { listProjects } from "@/lib/db/projects";
import { InboxWorkspace } from "./inbox-workspace";

/**
 * The Inbox (BUILD_SPEC §9): one unified feed from exactly two sources —
 * unfiled notes/tasks + pending prompts. The server page just fetches; all
 * grouping and interaction live in the client workspace so actions can be
 * optimistic (cards clear instantly, with undo).
 */
export default async function InboxPage() {
  const [items, projects] = await Promise.all([listInbox(), listProjects()]);

  return (
    <InboxWorkspace
      items={items}
      projects={projects.map((p) => ({
        id: p.id,
        name: p.name,
        color: p.color,
      }))}
    />
  );
}
