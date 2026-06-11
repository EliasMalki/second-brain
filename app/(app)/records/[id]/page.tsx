import Link from "next/link";
import { notFound } from "next/navigation";
import {
  getRecord,
  getRecordType,
  listRecordTasks,
  sumReceiptsByRecord,
} from "@/lib/db/records";
import { getProject } from "@/lib/db/projects";
import { archiveRecordAction } from "../actions";
import { StageSelect } from "../stage-select";
import { formatCAD } from "../records-section";

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
      <p className="help">
        <Link href={`/projects/${record.project_id}`}>
          ← {project?.name ?? "Project"}
        </Link>
      </p>
      <div className="page-head">
        <h1>{record.name}</h1>
        {record.status === "archived" ? (
          <span className="badge badge-archived">archived</span>
        ) : (
          <StageSelect
            recordId={record.id}
            stage={record.stage}
            stages={type.stages}
          />
        )}
      </div>
      <p className="help" style={{ marginTop: 0 }}>
        {type.label_singular} · spent so far:{" "}
        <strong>{formatCAD(totals.get(record.id) ?? 0)}</strong>
      </p>

      <div className="stack">
        <div className="card">
          <h2 className="label">Open tasks</h2>
          {tasks.length === 0 ? (
            <p className="help">Nothing open for this {type.label_singular.toLowerCase()}.</p>
          ) : (
            <ul className="item-list">
              {tasks.map((t) => (
                <li key={t.id}>
                  <Link href={`/tasks/${t.id}`} className="item-row">
                    <span className="title">{t.title}</span>
                    <span className="meta">
                      {t.priority}
                      {t.effort ? ` · ${t.effort}` : ""}
                      {t.scheduled_for ? ` · ${t.scheduled_for}` : ""}
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </div>

        {record.status !== "archived" ? (
          <form action={archiveRecordAction} className="form-actions">
            <input type="hidden" name="id" value={record.id} />
            <input type="hidden" name="project_id" value={record.project_id} />
            <button type="submit" className="btn btn-danger">
              Archive {type.label_singular.toLowerCase()}
            </button>
            <span className="help">
              Hides it from the list. Tasks and receipts are kept.
            </span>
          </form>
        ) : null}
      </div>
    </>
  );
}
