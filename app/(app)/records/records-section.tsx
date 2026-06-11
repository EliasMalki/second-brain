import Link from "next/link";
import {
  getRecordTypeForProject,
  listRecords,
  sumReceiptsByRecord,
} from "@/lib/db/records";
import { RecordTypeForm } from "./record-type-form";
import { NewRecordForm } from "./new-record-form";
import { StageSelect } from "./stage-select";

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
        <h2 className="label">Records</h2>
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
      <h2 className="label">{type.label_plural}</h2>

      {sorted.length === 0 ? (
        <p className="help">
          No {type.label_plural.toLowerCase()} yet — add the first one below.
        </p>
      ) : (
        <ul className="item-list">
          {sorted.map((r) => (
            <li key={r.id} className="item-row">
              <Link
                href={`/records/${r.id}`}
                className="title"
                style={{ flex: 1 }}
              >
                {r.name}
              </Link>
              <span className="meta">{formatCAD(totals.get(r.id) ?? 0)}</span>
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
