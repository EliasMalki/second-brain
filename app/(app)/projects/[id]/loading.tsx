import { SkeletonHead, SkeletonCard, SkeletonTaskRows } from "../../skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <div className="stack">
        <div className="card">
          <div className="card-label">
            <span className="sk" style={{ width: 15, height: 15, borderRadius: 4 }} />
            <span className="sk sk-line" style={{ width: 90 }} />
          </div>
          <SkeletonTaskRows count={3} />
        </div>
        <div className="card-grid">
          <SkeletonCard lines={3} />
          <SkeletonCard lines={2} />
        </div>
      </div>
    </>
  );
}
