import Link from "next/link";
import { searchAll } from "@/lib/db/search";
import { listProjects } from "@/lib/db/projects";
import { fmtShort } from "@/lib/dates";

/**
 * Unified search (BUILD_SPEC §2b): one bar over notes + tasks. Each hit
 * shows its type and project.
 */
export default async function SearchPage({
  searchParams,
}: {
  searchParams: { q?: string };
}) {
  const q = (searchParams.q ?? "").trim();
  const [hits, projects] = await Promise.all([
    q ? searchAll(q) : Promise.resolve([]),
    listProjects({ includeArchived: true }),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  return (
    <>
      <div className="page-head">
        <h1>Search</h1>
        <span className="help">Notes and tasks, one query</span>
      </div>

      <form method="get" action="/search" className="card inline-form">
        <input
          type="search"
          name="q"
          defaultValue={q}
          placeholder="Search your brain…"
          aria-label="Search"
          style={{ flex: 1 }}
          autoFocus
        />
        <button type="submit" className="btn btn-primary">
          Search
        </button>
      </form>

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
        {q && hits.length === 0 ? (
          <div className="card empty">No matches for “{q}”.</div>
        ) : null}

        {hits.length > 0 ? (
          <ul className="item-list">
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`} className="card inbox-row">
                <div className="inbox-row-main">
                  <span className="badge">{h.type}</span>
                  <Link
                    href={h.type === "note" ? `/notes/${h.id}` : `/tasks/${h.id}`}
                    className="inbox-text"
                  >
                    {h.title}
                    {h.snippet && h.snippet !== h.title ? (
                      <span className="meta" style={{ display: "block" }}>
                        {h.snippet}
                      </span>
                    ) : null}
                  </Link>
                  <span className="meta">
                    {[projectName(h.projectId), fmtShort(h.createdAt.slice(0, 10))]
                      .filter(Boolean)
                      .join(" · ")}
                  </span>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
