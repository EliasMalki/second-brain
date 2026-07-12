import { SkeletonCard, SkeletonTaskRows } from "../../skeletons";

export default function Loading() {
  return (
    <div className="proj2" aria-hidden="true">
      <div className="p2-top">
        <span className="p2-back">← Projects</span>
      </div>
      <div
        className="p2-hero"
        style={{
          background: "var(--color-background-tertiary)",
          borderColor: "var(--color-border-tertiary)",
          minHeight: 140,
        }}
      >
        <div
          className="p2-id"
          style={{ display: "flex", flexDirection: "column", gap: 10 }}
        >
          <span className="sk sk-line" style={{ width: 160, height: 20 }} />
          <span className="sk sk-line" style={{ width: 240 }} />
        </div>
      </div>
      <div className="p2-stats">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="p2-tile" key={i}>
            <div className="sk sk-line" style={{ width: 44, height: 20 }} />
            <div
              className="sk sk-line"
              style={{ width: 84, height: 10, marginTop: 8 }}
            />
          </div>
        ))}
      </div>
      <div className="p2-work">
        <div className="p2-main">
          <div className="p2-tabs">
            {["Tasks", "Notes", "Records", "Receipts"].map((t) => (
              <span className="p2-tab" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="add-bar" style={{ height: 46 }} />
          <SkeletonTaskRows count={4} />
        </div>
        <aside className="p2-aside">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </aside>
      </div>
    </div>
  );
}
