import Link from "next/link";
import { notFound } from "next/navigation";
import { getProject } from "@/lib/db/projects";
import { RecordsSection } from "../../records/records-section";
import { ReceiptsSection } from "../../receipts/receipts-section";
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
      <p className="help" style={{ marginTop: 0 }}>
        <Link href={`/tasks?project=${project.id}`}>
          View this project&apos;s tasks →
        </Link>
      </p>
      <div className="stack">
        <RecordsSection projectId={project.id} />
        <ReceiptsSection projectId={project.id} />
        <EditProjectForm project={project} />
      </div>
    </>
  );
}
