import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { OfflineBanner } from "./offline-banner";

/**
 * Shell for every authenticated page: top nav + content container.
 * Routes outside this group (/login, /auth/*) stay bare.
 */
export default async function AppLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  const user = await requireUser();

  return (
    <>
      <OfflineBanner />
      <header className="site-header">
        <div className="container">
          <Link href="/" className="brand">
            Second Brain
          </Link>
          <nav className="site-nav">
            <Link href="/">Today</Link>
            <Link href="/week">Week</Link>
            <Link href="/inbox">Inbox</Link>
            <Link href="/tasks">Tasks</Link>
            <Link href="/recurrences">Recurring</Link>
            <Link href="/notes">Notes</Link>
            <Link href="/projects">Projects</Link>
          </nav>
          <div className="user">
            <a href="/export" className="btn" title="Download everything as zip">
              Export
            </a>
            <span>{user.email}</span>
            <form action="/auth/signout" method="post">
              <button type="submit" className="btn">
                Sign out
              </button>
            </form>
          </div>
        </div>
      </header>
      <main className="container">{children}</main>
    </>
  );
}
