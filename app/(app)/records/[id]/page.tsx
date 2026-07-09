import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRecord,
  getRecordType,
  listRecordTasks,
  sumReceiptsByRecord,
} from "@/lib/db/records";
import { getProject } from "@/lib/db/projects";
import { ArchiveRecordButton } from "../archive-record-button";
import { StageSelect } from "../stage-select";
import { formatCAD } from "../records-section";
import { ReceiptsSection } from "../../receipts/receipts-section";
import { TaskRow } from "../../tasks/task-row";
import { ProjectTag } from "../../project-tag";

export default async function RecordDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const record = await getRecord(params.id);
  if (!record) notFound();

  const [type, project, tasks, totals] = await Promise.all([
    getRecordType(record.record_type_id),
    getProject(record.project_id),
    listRecordTasks(record.id),
    sumReceiptsByRecord([record.id]),
  ]);
  if (!type) notFound();

  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        <Link href={`/projects/${record.project_id}`}>
          ← {project?.name ?? "Project"}
        </Link>
      </p>
      <div className="view-head" style={{ marginBottom: "var(--space-2)" }}>
        <span className="view-title">{record.name}</span>
        {project ? <ProjectTag name={project.name} color={project.color} /> : null}
        {record.status === "archived" ? (
          <span className="pill pill-archived">archived</span>
        ) : (
          <StageSelect
            recordId={record.id}
            stage={record.stage}
            stages={type.stages}
          />
        )}
      </div>
      <p className="view-sub" style={{ marginBottom: "var(--space-4)" }}>
        {type.label_singular} · spent so far:{" "}
        <strong style={{ color: "var(--color-text-primary)" }}>
          {formatCAD(totals.get(record.id) ?? 0)}
        </strong>
      </p>

      <div className="stack">
        <div className="card">
          <p className="card-label">
            <i className="ti ti-checkbox" aria-hidden="true" />
            Open tasks · {tasks.length}
          </p>
          {tasks.length === 0 ? (
            <p className="help">
              Nothing open for this {type.label_singular.toLowerCase()}.
            </p>
          ) : (
            <ul className="tasks">
              {tasks.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={null}
                  projectColor={project?.color ?? null}
                />
              ))}
            </ul>
          )}
        </div>

        <ReceiptsSection projectId={record.project_id} recordId={record.id} />

        {record.status !== "archived" ? (
          <ArchiveRecordButton
            recordId={record.id}
            projectId={record.project_id}
            label={type.label_singular.toLowerCase()}
          />
        ) : null}
      </div>
    </>
  );
}
