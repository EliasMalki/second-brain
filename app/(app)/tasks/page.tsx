import { listProjects } from "@/lib/db/projects";
import { listTasks } from "@/lib/db/tasks";
import { listRecurrences } from "@/lib/db/recurrences";
import { QuickAddTask } from "./quick-add-task";
import { FilterBar } from "./filter-bar";
import { TaskList } from "./task-list";
import { RecurrenceManager } from "./recurrence-manager";
import { parseTasksParams } from "./params";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const params = parseTasksParams({
    status: first(searchParams.status),
    view: first(searchParams.view),
    project: first(searchParams.project),
    timing: first(searchParams.timing),
    sort: first(searchParams.sort),
    group: first(searchParams.group),
  });

  const projects = await listProjects();
  const projOpts = projects.map((p) => ({
    id: p.id,
    name: p.name,
    paused: p.status === "paused",
  }));

  return (
    <>
      <div className="view-head">
        <span className="view-title">Tasks</span>
      </div>

      {/* CREATE — the add-task box sits at the top */}
      <QuickAddTask
        projects={projOpts}
        defaultProjectId={
          params.projectIds.length === 1 ? params.projectIds[0] : undefined
        }
      />

      {/* VIEW — the filter bar sits directly above the list it controls */}
      <FilterBar current={params} projects={projOpts} />

      <div className="stack">
        {params.view === "recurring" ? (
          <RecurrenceManager
            recurrences={await listRecurrences()}
            projects={projOpts}
          />
        ) : (
          <TaskList
            tasks={await listTasks({
              status: params.status,
              projectIds: params.projectIds,
              timing: params.timing ?? undefined,
            })}
            projects={projOpts}
            sort={params.sort}
            group={params.group}
            status={params.status}
          />
        )}
      </div>
    </>
  );
}
