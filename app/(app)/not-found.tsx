import Link from "next/link";

/**
 * In-shell 404 (e.g. opening a deleted note or a bad URL) so the user lands on
 * app chrome with a clear way back, not the bare Next.js default page.
 */
export default function NotFound() {
  return (
    <div className="card empty">
      <i className="ti ti-file-off" aria-hidden="true" />
      <span>This doesn&apos;t exist anymore — it may have been deleted.</span>
      <div className="empty-action">
        <Link className="btn" href="/">
          <i className="ti ti-home" aria-hidden="true" />
          Back to Home
        </Link>
        <Link className="btn" href="/notes">
          <i className="ti ti-note" aria-hidden="true" />
          Notes
        </Link>
      </div>
    </div>
  );
}
