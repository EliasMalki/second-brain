import { SkeletonHead, SkeletonTaskRows } from "./skeletons";

/**
 * Group-wide fallback (covers Today and any route without its own loading.tsx).
 * The layout — sidebar + docked composer — stays mounted; only the content
 * pane shows the skeleton, so there's no blank flash on navigation.
 */
export default function Loading() {
  return (
    <>
      <SkeletonHead />
      <SkeletonTaskRows count={3} />
    </>
  );
}
