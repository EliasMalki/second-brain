"use client";

import { useRouter } from "next/navigation";

export type BoardRecord = {
  id: string;
  name: string;
  stage: string | null;
};

/** Quiet, project-tinted stage dot: greyer early, closest to --proj at the end. */
function stageDot(index: number, total: number): string {
  const pct = total <= 1 ? 70 : Math.round(35 + (index / (total - 1)) * 60);
  return `color-mix(in srgb, var(--proj) ${pct}%, var(--color-text-tertiary))`;
}

/**
 * Records board / Kanban (§5, v1). One column per record_type stage, records
 * as cards in their current stage. Reads as the §10 list's alternate view.
 *
 * Records whose stage is null or no longer in the pipeline land in a trailing
 * "Unsorted" column so nothing is ever hidden.
 */
export function RecordsBoard({
  stages,
  records,
}: {
  projectId: string;
  labelSingular: string;
  stages: string[];
  records: BoardRecord[];
}) {
  const router = useRouter();

  const known = new Set(stages);
  const byStage = new Map<string, BoardRecord[]>(stages.map((s) => [s, []]));
  const orphans: BoardRecord[] = [];
  for (const r of records) {
    if (r.stage && known.has(r.stage)) byStage.get(r.stage)!.push(r);
    else orphans.push(r);
  }

  const columns: { key: string; label: string; dot: string | null; items: BoardRecord[] }[] =
    stages.map((s, i) => ({
      key: s,
      label: s,
      dot: stageDot(i, stages.length),
      items: byStage.get(s)!,
    }));
  if (orphans.length > 0) {
    columns.push({ key: "__unsorted__", label: "Unsorted", dot: null, items: orphans });
  }

  function open(id: string) {
    router.push(`/records/${id}`);
  }

  return (
    <div className="board" role="list">
      {columns.map((col) => (
        <div key={col.key} className="bcol" role="listitem">
          <div className="bcol-head">
            {col.dot ? (
              <span className="stagedot" style={{ background: col.dot }} aria-hidden="true" />
            ) : (
              <span className="stagedot stagedot-muted" aria-hidden="true" />
            )}
            <span className="bcol-name">{col.label}</span>
            <span className="n">{col.items.length}</span>
          </div>

          <div className="bcol-cards">
            {col.items.map((r) => (
              <div
                key={r.id}
                className="rcard"
                role="link"
                tabIndex={0}
                onClick={() => open(r.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    open(r.id);
                  }
                }}
              >
                <span className="rcard-name">{r.name}</span>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}
