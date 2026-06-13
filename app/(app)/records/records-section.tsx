import Link from "next/link";
import {
  getRecordTypeForProject,
  listRecords,
  sumReceiptsByRecord,
} from "@/lib/db/records";
import { RecordTypeForm } from "./record-type-form";
import { NewRecordForm } from "./new-record-form";
import { StageSelect } from "./stage-select";
import { EmptyState } from "../empty-state";

export function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

/**
 * The §10 records UI on a project page: list + stage dropdown + per-record
 * P&L. If the project has no record type yet, offer the one-time setup form.
 */
export async function RecordsSection({ projectId }: { projectId: string }) {
  const type = await getRecordTypeForProject(projectId);

  if (!type) {
    return (
      <div className="card">
        <p className="card-label">
          <i className="ti ti-folders" aria-hidden="true" />
          Records
        </p>
        <p className="help">
          Optional: if this project tracks things — cars, clients, jobs — set
          up a record type. Each record gets its own stage, tasks, and P&amp;L.
        </p>
        <details>
          <summary className="help" style={{ cursor: "pointer" }}>
            Set up a record type
          </summary>
          <RecordTypeForm projectId={projectId} />
        </details>
      </div>
    );
  }

  const records = await listRecords(projectId);
  const totals = await sumReceiptsByRecord(records.map((r) => r.id));

  // pipeline order: stage position, then age — the §10 list, not a board
  const stageIndex = (s: string | null) =>
    s === null ? type.stages.length : type.stages.indexOf(s);
  const sorted = [...records].sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage),
  );

  return (
    <div className="card">
      <p className="card-label">
        <i className="ti ti-folders" aria-hidden="true" />
        {type.label_plural}
        <span className="pin" style={{ color: "var(--color-text-tertiary)" }}>
          {sorted.length}
        </span>
      </p>

      {sorted.length === 0 ? (
        <EmptyState
          compact
          icon="ti-folders"
          title={`No ${type.label_plural.toLowerCase()} yet — add a ${type.label_singular.toLowerCase()} below.`}
        />
      ) : (
        <ul className="tasks">
          {sorted.map((r) => (
            <li
              key={r.id}
              className="task-item"
              style={{ alignItems: "center" }}
            >
              <div className="task-body">
                <Link href={`/records/${r.id}`} className="task-link">
                  <p className="task-title">{r.name}</p>
                </Link>
              </div>
              <span className="view-sub">{formatCAD(totals.get(r.id) ?? 0)}</span>
              <StageSelect
                recordId={r.id}
                stage={r.stage}
                stages={type.stages}
              />
            </li>
          ))}
        </ul>
      )}

      <details style={{ marginTop: "0.75rem" }}>
        <summary className="help" style={{ cursor: "pointer" }}>
          New {type.label_singular.toLowerCase()}
        </summary>
        <NewRecordForm
          projectId={projectId}
          labelSingular={type.label_singular}
          stages={type.stages}
        />
      </details>
    </div>
  );
}
