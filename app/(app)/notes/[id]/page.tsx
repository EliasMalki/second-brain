import Link from "next/link";
import { notFound } from "next/navigation";
import { listProjects } from "@/lib/db/projects";
import { getNote } from "@/lib/db/notes";
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

  return (
    <>
      <p className="help">
        <Link href="/notes">← Notes</Link>
      </p>

      <div className="page-head">
        <h1>
          {note.pinned ? "📌 " : ""}
          {note.title || "Untitled"}
        </h1>
        <span className="badge badge-archived">{projectName}</span>
      </div>

      <div className="stack">
        {/* Read view */}
        <article className="card">
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
        </article>

        {/* Quick actions */}
        <div className="form-actions">
          <form action={togglePinAction}>
            <input type="hidden" name="id" value={note.id} />
            <input type="hidden" name="pinned" value={note.pinned ? "0" : "1"} />
            <button type="submit" className="btn">
              {note.pinned ? "Unpin" : "📌 Pin"}
            </button>
          </form>
          {note.archived ? (
            <form action={unarchiveNoteAction}>
              <input type="hidden" name="id" value={note.id} />
              <button type="submit" className="btn">
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
        <div className="card">
          <h2 className="label">Edit</h2>
          <NoteForm
            note={note}
            projects={projects.map((p) => ({ id: p.id, name: p.name }))}
          />
        </div>
      </div>
    </>
  );
}
