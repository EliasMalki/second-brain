import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjects } from "@/lib/db/projects";
import { getNote } from "@/lib/db/notes";
import { fmtShort } from "@second-brain/shared/domain/dates";
import { Markdown } from "../markdown";
import { NoteForm } from "../note-form";
import {
  archiveNoteAction,
  togglePinAction,
  unarchiveNoteAction,
} from "../actions";

export default async function NoteDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [note, projects] = await Promise.all([
    getNote(params.id),
    listProjects({ includeArchived: true }),
  ]);
  if (!note) notFound();

  const projectName =
    projects.find((p) => p.id === note.project_id)?.name ?? "Inbox";
  const sub = [
    projectName,
    note.kind,
    `updated ${fmtShort(note.updated_at.slice(0, 10))}`,
  ].join(" · ");

  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        <Link href="/notes">
          <i className="ti ti-arrow-left" aria-hidden="true" /> Notes
        </Link>
      </p>

      <div className="stack">
        {/* Full-page read view (markdown) */}
        <article className="note-page">
          <div className="note-page-body">
            <p className="view-title" style={{ marginBottom: 4 }}>
              {note.pinned ? (
                <i className="ti ti-pin" style={{ marginRight: 6, fontSize: 18 }} aria-hidden="true" />
              ) : null}
              {note.title || "Untitled"}
            </p>
            <p className="note-page-sub">{sub}</p>

            <Markdown>{note.body}</Markdown>

            {note.tags.length > 0 ? (
              <div className="tag-row" style={{ marginTop: "var(--space-4)" }}>
                {note.tags.map((t) => (
                  <span key={t} className="tag">
                    {t}
                  </span>
                ))}
              </div>
            ) : null}
          </div>
        </article>

        {/* Quick actions */}
        <div className="form-actions">
          <form action={togglePinAction}>
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="pinned" value={note.pinned ? "0" : "1"} />
            <button type="submit" className="btn-pill">
              <i className="ti ti-pin" aria-hidden="true" />
              {note.pinned ? "Unpin" : "Pin"}
            </button>
          </form>
          {note.archived ? (
            <form action={unarchiveNoteAction}>
              <input type="hidden" name="id" value={note.id} />
              <button type="submit" className="btn-pill">
                Unarchive
              </button>
            </form>
          ) : (
            <form action={archiveNoteAction}>
              <input type="hidden" name="id" value={note.id} />
              <button type="submit" className="btn btn-danger">
                Archive
              </button>
            </form>
          )}
        </div>

        {/* Edit */}
        <details>
          <summary
            className="card-label"
            style={{ cursor: "pointer", margin: 0, padding: "var(--space-2) 0" }}
          >
            <i className="ti ti-pencil" aria-hidden="true" />
            Edit note
          </summary>
          <div className="card" style={{ marginTop: "var(--space-2)" }}>
            <NoteForm
              note={note}
              projects={projects.map((p) => ({ id: p.id, name: p.name }))}
            />
          </div>
        </details>
      </div>
    </>
  );
}
