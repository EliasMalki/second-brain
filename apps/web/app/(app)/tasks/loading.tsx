import { SkeletonHead } from "../skeletons";

/** Matches the v4 layout: header, add-bar, control bar, then table rows. */
export default function TasksLoading() {
  return (
    <>
      <SkeletonHead />
      <div
        className="sk sk-line"
        style={{ height: 56, borderRadius: 10, marginBottom: "var(--space-4)" }}
        aria-hidden="true"
      />
      <div className="controls" aria-hidden="true" style={{ marginBottom: "var(--space-3)" }}>
        <span className="sk sk-line" style={{ width: 280, height: 30, borderRadius: 6 }} />
        <span className="spacer" />
        <span className="sk sk-line" style={{ width: 96, height: 30, borderRadius: 6 }} />
      </div>
      <div className="list" aria-hidden="true">
        <div className="hdr">
          <span />
          <span>TITLE</span>
          <span>PROJECT</span>
          <span>WHEN</span>
        </div>
        {Array.from({ length: 6 }).map((_, i) => (
          <div className="row" key={i}>
            <span className="sk sk-chip" />
            <span className="sk sk-line" style={{ width: `${52 + ((i * 13) % 34)}%` }} />
            <span className="sk sk-line" style={{ width: 64, height: 18, borderRadius: 6 }} />
            <span className="sk sk-line" style={{ width: 36 }} />
          </div>
        ))}
      </div>
    </>
  );
}
