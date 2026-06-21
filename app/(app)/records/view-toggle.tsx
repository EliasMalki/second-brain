import Link from "next/link";

/**
 * List / Board toggle for the Records tab header. Two links that preserve
 * `?tab=records` and flip `view` — view state lives in the URL like the tabs
 * themselves, so a refresh keeps the chosen view.
 */
export function ViewToggle({
  projectId,
  view,
}: {
  projectId: string;
  view: "list" | "board";
}) {
  const base = `/projects/${projectId}?tab=records`;
  return (
    <div className="viewtoggle" role="group" aria-label="Records view">
      <Link
        href={`${base}&view=list`}
        scroll={false}
        className={view === "list" ? "on" : ""}
        aria-current={view === "list" ? "true" : undefined}
      >
        <i className="ti ti-list" aria-hidden="true" />
        List
      </Link>
      <Link
        href={`${base}&view=board`}
        scroll={false}
        className={view === "board" ? "on" : ""}
        aria-current={view === "board" ? "true" : undefined}
      >
        <i className="ti ti-layout-columns" aria-hidden="true" />
        Board
      </Link>
    </div>
  );
}
