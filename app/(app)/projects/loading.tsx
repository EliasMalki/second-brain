import { SkeletonHead, SkeletonProjectGrid } from "../skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <div className="quick-add" aria-hidden="true" style={{ height: 46 }} />
      <p className="ahead">
        <span className="sk sk-line" style={{ width: 70, height: 10 }} />
      </p>
      <SkeletonProjectGrid count={4} />
    </>
  );
}
