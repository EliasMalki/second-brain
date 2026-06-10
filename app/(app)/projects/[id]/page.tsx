import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/db/projects";
import { EditProjectForm } from "./edit-project-form";

export default async function ProjectDetailPage({
  params,
}: {
  params: { id: string };
}) {
  const project = await getProject(params.id);
  if (!project) notFound();

  return (
    <>
      <p className="help">
        <Link href="/projects">← Projects</Link>
      </p>
      <div className="page-head">
        <h1>{project.name}</h1>
        <span className={`badge badge-${project.status}`}>
          {project.status}
        </span>
      </div>
      <EditProjectForm project={project} />
    </>
  );
}
