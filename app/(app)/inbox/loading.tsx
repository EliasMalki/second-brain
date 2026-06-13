import { SkeletonHead, SkeletonFeed } from "../skeletons";

export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <SkeletonFeed count={3} />
    </>
  );
}
