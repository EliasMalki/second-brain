import Link from "next/link";
import { createClient } from "@/lib/supabase/server";
import { listProjects } from "@/lib/db/projects";

export default async function HomePage() {
  // Org name read via RLS-scoped client: proves session + membership intact.
  const supabase = createClient();
  const { data: orgs } = await supabase
    .from("organizations")
    .select("name")
    .limit(1);
  const orgName = orgs?.[0]?.name ?? "your space";
  const projects = await listProjects();

  return (
    <>
      <div className="page-head">
        <h1>{orgName}</h1>
      </div>
      <div className="card">
        <p>
          {projects.length === 0 ? (
            <>No projects yet.</>
          ) : (
            <>
              {projects.length} active project
              {projects.length === 1 ? "" : "s"}.
            </>
          )}{" "}
          <Link href="/projects">Go to projects →</Link>
        </p>
        <p className="help">
          Today / Week views and capture arrive in the next steps.
        </p>
      </div>
    </>
  );
}
