import Link from "next/link";
import {
  getRecordTypeForProject,
  listRecords,
  sumReceiptsByRecord,
} from "@/lib/db/records";
import { projectColorVars } from "@/lib/colors";
import { RecordTypeForm } from "./record-type-form";
import { NewRecordForm } from "./new-record-form";
import { StageSelect } from "./stage-select";
import { ViewToggle } from "./view-toggle";
import { RecordsBoard } from "./records-board";
import { EmptyState } from "../empty-state";

export function formatCAD(amount: number): string {
  return new Intl.NumberFormat("en-CA", {
    style: "currency",
    currency: "CAD",
  }).format(amount);
}

/**
 * The records UI on a project page. List view = the §10 list + stage dropdown
 * + per-record P&L; Board view = the §5 Kanban. The toggle lives in the tab
 * header. If the project has no record type yet, offer the one-time setup form
 * (no board — there are no stages to build columns from).
 */
export async function RecordsSection({
  projectId,
  projectColor,
  view,
}: {
  projectId: string;
  projectColor: string | null;
  view: "list" | "board";
}) {
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

  // pipeline order: stage position, then age — shared by the list view
  const stageIndex = (s: string | null) =>
    s === null ? type.stages.length : type.stages.indexOf(s);
  const sorted = [...records].sort(
    (a, b) => stageIndex(a.stage) - stageIndex(b.stage),
  );

  const header = (
    <div className="rec-head">
      <p className="card-label" style={{ margin: 0 }}>
        <i className="ti ti-folders" aria-hidden="true" />
        {type.label_plural}
        <span className="pin" style={{ color: "var(--color-text-tertiary)" }}>
          {records.length}
        </span>
      </p>
      <ViewToggle projectId={projectId} view={view} />
    </div>
  );

  return (
    <div style={projectColorVars(projectColor)}>
      {header}

      {view === "board" ? (
        <RecordsBoard
          projectId={projectId}
          labelSingular={type.label_singular}
          stages={type.stages}
          records={records.map((r) => ({
            id: r.id,
            name: r.name,
            stage: r.stage,
          }))}
        />
      ) : (
        <div className="card">
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
                  <span className="view-sub">
                    {formatCAD(totals.get(r.id) ?? 0)}
                  </span>
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
      )}
    </div>
  );
}
