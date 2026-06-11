import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { listNotes, type Note } from "@/lib/db/notes";
import { NoteForm } from "./note-form";

/** A short, single-line plaintext-ish preview of a markdown body. */
function preview(note: Note): string {
  const source = note.title ? note.body : note.body;
  const firstMeaningful =
    source
      .split("\n")
      .map((l) => l.replace(/^[#>\-*\s]+/, "").trim())
      .find((l) => l.length > 0) ?? "";
  return firstMeaningful.length > 120
    ? `${firstMeaningful.slice(0, 120)}…`
    : firstMeaningful;
}

export default async function NotesPage({
  searchParams,
}: {
  searchParams: { view?: string; archived?: string };
}) {
  const inboxOnly = searchParams.view === "inbox";
  const includeArchived = searchParams.archived === "1";

  const [notes, projects] = await Promise.all([
    listNotes({ inboxOnly, includeArchived }),
    listProjects(),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  const viewHref = (view: "all" | "inbox") =>
    `/notes${view === "inbox" ? "?view=inbox" : ""}`;

  return (
    <>
      <div className="page-head">
        <h1>Notes</h1>
        <Link
          href={
            includeArchived
              ? viewHref(inboxOnly ? "inbox" : "all")
              : `${viewHref(inboxOnly ? "inbox" : "all")}${inboxOnly ? "&" : "?"}archived=1`
          }
          className="help"
        >
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <nav className="tabs">
        <Link
          href={viewHref("all")}
          className={inboxOnly ? "tab" : "tab tab-active"}
        >
          All
        </Link>
        <Link
          href={viewHref("inbox")}
          className={inboxOnly ? "tab tab-active" : "tab"}
        >
          Inbox
        </Link>
      </nav>

      <div className="stack">
        {notes.length === 0 ? (
          <div className="card empty">
            {inboxOnly
              ? "Inbox is empty — unfiled notes show up here."
              : "No notes yet — write your first one below."}
          </div>
        ) : (
          <ul className="item-list">
            {notes.map((n) => (
              <li key={n.id}>
                <Link href={`/notes/${n.id}`} className="item-row note-row">
                  <span className="note-main">
                    <span className="title">
                      {n.pinned ? "📌 " : ""}
                      {n.title || preview(n) || "Untitled"}
                    </span>
                    {n.title ? (
                      <span className="meta">{preview(n)}</span>
                    ) : null}
                    {n.tags.length > 0 ? (
                      <span className="tag-row">
                        {n.tags.map((t) => (
                          <span key={t} className="tag">
                            {t}
                          </span>
                        ))}
                      </span>
                    ) : null}
                  </span>
                  <span
                    className={`badge ${n.project_id ? "badge-archived" : "badge-prio-B"}`}
                  >
                    {projectName(n.project_id) ?? "Inbox"}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
        )}

        <div className="card">
          <h2 className="label">New note</h2>
          <NoteForm projects={projects.map((p) => ({ id: p.id, name: p.name }))} />
        </div>
      </div>
    </>
  );
}
