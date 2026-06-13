import { SkeletonHead, SkeletonFeed } from "../skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <div style={{ height: 44 }} />
      <SkeletonFeed count={3} />
    </>
  );
}
