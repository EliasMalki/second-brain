import { SkeletonHead, SkeletonTaskRows } from "../skeletons";

/** Shown while the Tasks page fetches: header, add-box + filter placeholders, rows. */
export default function TasksLoading() {
  return (
    <>
      <SkeletonHead />
      <div className="sk sk-line" style={{ height: 78, borderRadius: 10 }} aria-hidden="true" />
      <div
        className="fbar"
        aria-hidden="true"
        style={{ marginTop: "var(--space-4)" }}
      >
        {Array.from({ length: 5 }).map((_, i) => (
          <span
            key={i}
            className="sk sk-line"
            style={{ width: 70 + ((i * 17) % 40), height: 26, borderRadius: 6 }}
          />
        ))}
      </div>
      <SkeletonTaskRows count={5} />
    </>
  );
}
