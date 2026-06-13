import { SkeletonHead, SkeletonTaskRows } from "../skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <div className="stack">
        <SkeletonTaskRows count={2} />
        <SkeletonTaskRows count={3} />
      </div>
    </>
  );
}
