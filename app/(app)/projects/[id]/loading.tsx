import { SkeletonCard, SkeletonTaskRows } from "../../skeletons";

export default function Loading() {
  return (
    <>
      <p className="view-sub" style={{ marginBottom: "var(--space-3)" }}>
        ← Projects
      </p>
      <div className="proj-header" aria-hidden="true">
        <span className="proj-accent" />
        <div className="proj-headtext" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <span className="sk sk-line" style={{ width: 160, height: 20 }} />
          <span className="sk sk-line" style={{ width: 240 }} />
        </div>
      </div>
      <div className="proj-page">
        <div className="proj-main">
          <div className="ptabs" aria-hidden="true">
            {["Tasks", "Notes", "Records", "Receipts"].map((t) => (
              <span className="ptab" key={t}>
                {t}
              </span>
            ))}
          </div>
          <div className="quick-add" style={{ height: 46 }} aria-hidden="true" />
          <SkeletonTaskRows count={4} />
        </div>
        <aside className="proj-aside">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </aside>
      </div>
    </>
  );
}
