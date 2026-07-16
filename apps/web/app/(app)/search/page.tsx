import Link from "next/link";
import { searchAll } from "@/lib/db/search";
import { listProjects } from "@/lib/db/projects";
import { fmtShort } from "@second-brain/shared/domain/dates";
import { ProjectTag } from "../project-tag";
import { EmptyState } from "../empty-state";

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
  const projectOf = (id: string | null) =>
    (id ? projects.find((p) => p.id === id) : null) ?? null;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Search</span>
        <span className="view-sub">Notes and tasks, one query</span>
      </div>

      <form method="get" action="/search" className="card inline-form">
        <i
          className="ti ti-search"
          style={{ color: "var(--color-text-tertiary)" }}
          aria-hidden="true"
        />
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
          <EmptyState icon="ti-search-off" title={`Nothing found for “${q}”.`} />
        ) : null}

        {hits.length > 0 ? (
          <ul className="feed">
            {hits.map((h) => (
              <li key={`${h.type}-${h.id}`} className="feed-item">
                <span className="feed-ic neutral">
                  <i
                    className={`ti ${h.type === "note" ? "ti-note" : "ti-checkbox"}`}
                    aria-hidden="true"
                  />
                </span>
                <div className="feed-body">
                  <p
                    className="feed-type"
                    style={{ display: "flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}
                  >
                    <span>
                      {h.type} · {fmtShort(h.createdAt.slice(0, 10))}
                    </span>
                    {(() => {
                      const proj = projectOf(h.projectId);
                      return proj ? (
                        <ProjectTag name={proj.name} color={proj.color} />
                      ) : null;
                    })()}
                  </p>
                  <p className="feed-text">
                    <Link
                      href={h.type === "note" ? `/notes?note=${h.id}` : `/tasks/${h.id}`}
                    >
                      {h.title}
                    </Link>
                    {h.snippet && h.snippet !== h.title ? (
                      <span
                        className="view-sub"
                        style={{ display: "block", marginTop: 2 }}
                      >
                        {h.snippet}
                      </span>
                    ) : null}
                  </p>
                </div>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
    </>
  );
}
