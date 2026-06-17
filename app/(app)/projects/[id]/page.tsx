import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/db/projects";
import { ensureDefaultAreas } from "@/lib/db/areas";
import { listTasks } from "@/lib/db/tasks";
import { listNotes } from "@/lib/db/notes";
import { getRecordTypeForProject, listRecords } from "@/lib/db/records";
import { listReceipts, sumAmounts } from "@/lib/db/receipts";
import { projectColorVars } from "@/lib/colors";
import { TaskRow } from "../../tasks/task-row";
import { QuickAddTask } from "../../tasks/quick-add-task";
import { QuickAddNote } from "../../notes/quick-add-note";
import { Markdown } from "../../notes/markdown";
import { RecordsSection, formatCAD } from "../../records/records-section";
import { ReceiptsSection } from "../../receipts/receipts-section";
import { ProjectHeaderActions } from "./project-header-actions";
import { cloneProjectFromWorkflowAction as cloneFromWorkflow } from "../actions";
import { EmptyState } from "../../empty-state";

type Tab = "tasks" | "notes" | "records" | "receipts";
const TABS: Tab[] = ["tasks", "notes", "records", "receipts"];

function notedesc(body: string): string {
  const line = body.split("\n").find((l) => l.trim()) ?? "";
  return line.length > 90 ? `${line.slice(0, 90)}…` : line;
}

export default async function ProjectDetailPage({
  params,
  searchParams,
}: {
  params: { id: string };
  searchParams: { tab?: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  const [areas, tasks, notes, recordType, receipts] = await Promise.all([
    ensureDefaultAreas(),
    listTasks({ projectId: project.id }), // open
    listNotes({ projectId: project.id }),
    getRecordTypeForProject(project.id),
    listReceipts({ projectId: project.id }),
  ]);
  const records = recordType ? await listRecords(project.id) : [];

  const workflow = notes.find((n) => n.kind === "workflow");
  const otherNotes = notes.filter((n) => n.id !== workflow?.id);

  const counts: Record<Tab, number> = {
    tasks: tasks.length,
    notes: otherNotes.length,
    records: records.length,
    receipts: receipts.length,
  };
  const receiptTotal = sumAmounts(receipts);

  const tab: Tab = TABS.includes(searchParams.tab as Tab)
    ? (searchParams.tab as Tab)
    : "tasks";

  const areaName = project.area_id
    ? areas.find((a) => a.id === project.area_id)?.name ?? null
    : null;
  const avail =
    project.availability_default === "business_hours" ? "9–5" : "anytime";
  const colorVars = projectColorVars(project.color);
  const projOpt = [{ id: project.id, name: project.name }];

  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        <Link href="/projects">← Projects</Link>
      </p>

      {/* header — color accent + name + status + one-line description */}
      <header className="proj-header" style={colorVars}>
        <span className="proj-accent" aria-hidden="true" />
        <div className="proj-headtext">
          <div className="proj-titlerow">
            <span className="view-title">{project.name}</span>
            <ProjectHeaderActions
              project={project}
              areas={areas.map((a) => ({ id: a.id, name: a.name }))}
            />
          </div>
          <p className="proj-sub">
            {[areaName, avail, project.description].filter(Boolean).join(" · ") ||
              "No description yet."}
          </p>
        </div>
      </header>

      <div className="proj-page">
        {/* LEFT — the work: tabs + active panel */}
        <div className="proj-main">
          <nav className="ptabs" aria-label="Project sections">
            {TABS.map((t) => (
              <Link
                key={t}
                href={`/projects/${project.id}?tab=${t}`}
                scroll={false}
                className={t === tab ? "ptab on" : "ptab"}
              >
                <span style={{ textTransform: "capitalize" }}>{t}</span>
                {t === "records" && !recordType ? null : (
                  <span className="ct">{counts[t]}</span>
                )}
              </Link>
            ))}
          </nav>

          {tab === "tasks" ? (
            <div className="stack">
              <QuickAddTask projects={projOpt} defaultProjectId={project.id} />
              {tasks.length === 0 ? (
                <EmptyState compact icon="ti-checkbox" title="No tasks yet — add one above." />
              ) : (
                <ul className="tasks">
                  {tasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      projectName={null}
                      projectColor={project.color}
                    />
                  ))}
                </ul>
              )}
              <Link href={`/tasks?project=${project.id}`} className="proj-alllink">
                Open in Tasks →
              </Link>
            </div>
          ) : null}

          {tab === "notes" ? (
            <div className="stack">
              <QuickAddNote projects={projOpt} defaultProjectId={project.id} />
              {otherNotes.length === 0 ? (
                <EmptyState compact icon="ti-note" title="No notes yet." />
              ) : (
                <ul className="tasks">
                  {otherNotes.map((n) => (
                    <li key={n.id} className="task-item">
                      <i
                        className={`ti ${n.kind === "quick" ? "ti-bulb" : "ti-file-text"}`}
                        style={{ color: "var(--color-text-tertiary)", marginTop: 2 }}
                        aria-hidden="true"
                      />
                      <div className="task-body">
                        <Link href={`/notes/${n.id}`} className="task-link">
                          <p className="task-title">{n.title || notedesc(n.body)}</p>
                          <div className="task-meta">
                            <span>{n.kind}</span>
                          </div>
                        </Link>
                      </div>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          ) : null}

          {tab === "records" ? <RecordsSection projectId={project.id} /> : null}

          {tab === "receipts" ? <ReceiptsSection projectId={project.id} /> : null}
        </div>

        {/* RIGHT — the about/reference */}
        <aside className="proj-aside">
          <div className="card">
            <p className="card-label">
              <i className="ti ti-info-circle" aria-hidden="true" />
              Description
            </p>
            {project.description ? (
              <div style={{ fontSize: 13 }}>
                <Markdown>{project.description}</Markdown>
              </div>
            ) : (
              <p className="help" style={{ fontStyle: "italic" }}>
                No description yet — add one in Edit.
              </p>
            )}
          </div>

          <div className="card">
            <p className="card-label">
              <i className="ti ti-book-2" aria-hidden="true" />
              Workflow
              {workflow ? <i className="ti ti-pin pin" aria-hidden="true" /> : null}
            </p>
            {workflow ? (
              <>
                <Link
                  href={`/notes/${workflow.id}`}
                  className="task-link"
                  style={{ fontSize: 13, color: "var(--color-text-primary)", fontWeight: 600 }}
                >
                  {workflow.title || "Workflow"}
                </Link>
                <div
                  style={{
                    fontSize: 12.5,
                    color: "var(--color-text-secondary)",
                    marginTop: 6,
                  }}
                >
                  <Markdown>{notedesc(workflow.body)}</Markdown>
                </div>
                <form action={cloneFromWorkflow}>
                  <input type="hidden" name="source_id" value={project.id} />
                  <input type="hidden" name="workflow_id" value={workflow.id} />
                  <button type="submit" className="btn-pill go proj-clone">
                    <i className="ti ti-copy" aria-hidden="true" />
                    Start a project from this
                  </button>
                </form>
              </>
            ) : (
              <p className="help">
                Pin a note (kind <em>workflow</em>) to this project to keep a
                reusable playbook here.
              </p>
            )}
          </div>

          <Link href={`/projects/${project.id}?tab=receipts`} className="card proj-stat" scroll={false}>
            <p className="card-label">
              <i className="ti ti-receipt" aria-hidden="true" />
              Receipts
            </p>
            <div className="receipt-total">
              <span className="amt">{formatCAD(receiptTotal)}</span>
              <span className="view-sub">
                spent · {receipts.length} receipt{receipts.length === 1 ? "" : "s"}
              </span>
            </div>
          </Link>
        </aside>
      </div>
    </>
  );
}
