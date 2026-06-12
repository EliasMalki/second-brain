import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import { listNotes, type Note } from "@/lib/db/notes";
import { QuickAddNote } from "./quick-add-note";
import { fileNoteAction } from "./actions";

/** Inline "file an Inbox note into a project" control. */
function FileToProject({
  noteId,
  projects,
}: {
  noteId: string;
  projects: { id: string; name: string }[];
}) {
  return (
    <form action={fileNoteAction} className="file-control">
      <select
        name="project_id"
        className="select select-sm"
        defaultValue=""
        aria-label="File to project"
        required
      >
        <option value="" disabled>
          File to…
        </option>
        {projects.map((p) => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>
      <input type="hidden" name="id" value={noteId} />
      <button type="submit" className="btn-pill go">
        File
      </button>
    </form>
  );
}

/** A short, single-line plaintext-ish preview of a markdown body. */
function preview(note: Note): string {
  const firstMeaningful =
    note.body
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
  const archivedHref = includeArchived
    ? viewHref(inboxOnly ? "inbox" : "all")
    : `${viewHref(inboxOnly ? "inbox" : "all")}${inboxOnly ? "&" : "?"}archived=1`;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Notes</span>
        <span className="view-sub">{notes.length} shown</span>
        <Link href={archivedHref} className="view-sub spacer">
          {includeArchived ? "Hide archived" : "Show archived"}
        </Link>
      </div>

      <div className="fbar">
        <Link
          href={viewHref("all")}
          className={inboxOnly ? "fpill" : "fpill on"}
        >
          All
        </Link>
        <Link
          href={viewHref("inbox")}
          className={inboxOnly ? "fpill on" : "fpill"}
        >
          Inbox
        </Link>
      </div>

      <QuickAddNote projects={projects.map((p) => ({ id: p.id, name: p.name }))} />

      <div className="stack">
        {notes.length === 0 ? (
          <div className="card empty">
            <i className="ti ti-note" aria-hidden="true" />
            {inboxOnly
              ? "Inbox is empty — unfiled notes show up here."
              : "No notes yet — write your first one above."}
          </div>
        ) : (
          <ul className="tasks">
            {notes.map((n) => {
              const isIdea = n.kind === "quick";
              return (
                <li key={n.id} className="task-item">
                  <i
                    className={`ti ${isIdea ? "ti-bulb" : "ti-file-text"}`}
                    style={{ fontSize: 17, color: "var(--color-text-tertiary)", marginTop: 1 }}
                    aria-hidden="true"
                  />
                  <div className="task-body">
                    <Link href={`/notes/${n.id}`} className="task-link">
                      <p className="task-title">
                        {n.pinned ? (
                          <i
                            className="ti ti-pin"
                            style={{ marginRight: 4, fontSize: 13 }}
                            aria-hidden="true"
                          />
                        ) : null}
                        {n.title || preview(n) || "Untitled"}
                      </p>
                      {n.title || n.tags.length > 0 ? (
                        <div className="task-meta">
                          {n.title ? <span>{preview(n)}</span> : null}
                          {n.tags.map((t) => (
                            <span key={t} className="tag">
                              {t}
                            </span>
                          ))}
                        </div>
                      ) : null}
                    </Link>
                  </div>
                  <span className="tag">{projectName(n.project_id) ?? "Inbox"}</span>
                  {n.project_id === null && projects.length > 0 ? (
                    <FileToProject
                      noteId={n.id}
                      projects={projects.map((p) => ({ id: p.id, name: p.name }))}
                    />
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </>
  );
}
