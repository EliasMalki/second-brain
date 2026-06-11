import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { listTasks } from "@/lib/db/tasks";
import { listNotes } from "@/lib/db/notes";
import { TaskRow } from "../../tasks/task-row";
import { RecordsSection } from "../../records/records-section";
import { ReceiptsSection } from "../../receipts/receipts-section";
import { EditProjectForm } from "./edit-project-form";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const [project, areas] = await Promise.all([
    getProject(params.id),
    ensureDefaultAreas(),
  ]);
  if (!project) notFound();

  const [tasks, notes] = await Promise.all([
    listTasks({ projectId: project.id }), // open
    listNotes({ projectId: project.id }),
  ]);

  const areaName = project.area_id
    ? areas.find((a) => a.id === project.area_id)?.name ?? null
    : null;
  const avail =
    project.availability_default === "business_hours" ? "9–5" : "anytime";
  const workflow = notes.find((n) => n.kind === "workflow");
  const otherNotes = notes.filter((n) => n.id !== workflow?.id).slice(0, 5);

  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        <Link href="/projects">← Projects</Link>
      </p>

      <div className="stack">
        <div className="view-head" style={{ marginBottom: 0 }}>
          <span className="view-title">{project.name}</span>
          <span className={`pill pill-${project.status}`}>{project.status}</span>
          <span className="view-sub">
            {[areaName, avail].filter(Boolean).join(" · ")}
          </span>
        </div>

        {/* Description + Workflow */}
        <div className="card-grid">
          <div className="card">
            <p className="card-label">
              <i className="ti ti-info-circle" aria-hidden="true" />
              Description · what it is
            </p>
            <p
              style={{
                fontSize: 13,
                color: "var(--color-text-secondary)",
                margin: 0,
                lineHeight: 1.6,
              }}
            >
              {project.description || "No description yet."}
            </p>
          </div>
          {workflow ? (
            <div className="card">
              <p className="card-label">
                <i className="ti ti-book-2" aria-hidden="true" />
                Workflow · how I did it
                <i className="ti ti-pin pin" aria-hidden="true" />
              </p>
              <Link
                href={`/notes/${workflow.id}`}
                className="task-link"
                style={{ fontSize: 13, color: "var(--color-text-secondary)" }}
              >
                <strong style={{ color: "var(--color-text-primary)" }}>
                  {workflow.title || "Workflow"}
                </strong>
                <span className="muted-note" style={{ padding: "6px 0 0" }}>
                  <i className="ti ti-copy" aria-hidden="true" />
                  Open the workflow
                </span>
              </Link>
            </div>
          ) : null}
        </div>

        {/* Tasks */}
        <div className="card">
          <p className="card-label">
            <i className="ti ti-checkbox" aria-hidden="true" />
            Tasks · {tasks.length} open
            <Link href={`/tasks?project=${project.id}`} className="pin">
              all →
            </Link>
          </p>
          {tasks.length === 0 ? (
            <p className="help">No open tasks.</p>
          ) : (
            <ul className="tasks">
              {tasks.slice(0, 6).map((t) => (
                <TaskRow key={t.id} task={t} projectName={null} />
              ))}
            </ul>
          )}
        </div>

        {/* Notes + Receipts */}
        <div className="card-grid">
          <div className="card">
            <p className="card-label">
              <i className="ti ti-note" aria-hidden="true" />
              Notes · {otherNotes.length}
            </p>
            {otherNotes.length === 0 ? (
              <p className="help">No notes yet.</p>
            ) : (
              <div>
                {otherNotes.map((n) => (
                  <Link
                    key={n.id}
                    href={`/notes/${n.id}`}
                    className="receipt-row"
                    style={{ textDecoration: "none" }}
                  >
                    <span style={{ display: "flex", gap: 9, minWidth: 0 }}>
                      <i
                        className={`ti ${n.kind === "quick" ? "ti-bulb" : "ti-file-text"}`}
                        style={{ color: "var(--color-text-tertiary)" }}
                        aria-hidden="true"
                      />
                      {n.title || "Untitled"}
                    </span>
                  </Link>
                ))}
              </div>
            )}
          </div>
          <ReceiptsSection projectId={project.id} />
        </div>

        <RecordsSection projectId={project.id} />

        <details>
          <summary
            className="card-label"
            style={{ cursor: "pointer", margin: 0, padding: "var(--space-2) 0" }}
          >
            <i className="ti ti-settings" aria-hidden="true" />
            Edit project
          </summary>
          <div style={{ marginTop: "var(--space-2)" }}>
            <EditProjectForm
              project={project}
              areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            />
          </div>
        </details>
      </div>
    </>
  );
}
