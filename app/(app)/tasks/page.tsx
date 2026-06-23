import { listProjects } from "@/lib/db/projects";
import { listCompletedTasks, listTasks } from "@/lib/db/tasks";
import { listRecurrences } from "@/lib/db/recurrences";
import { recordPickerData } from "@/lib/db/records";
import { QuickAddTask } from "./quick-add-task";
import { FilterBar } from "./filter-bar";
import { TasksWorkspace } from "./tasks-workspace";
import { RecurrenceManager } from "./recurrence-manager";
import { parseTasksParams } from "./params";
import { isOverdue } from "./overdue";

const first = (v: string | string[] | undefined) =>
  Array.isArray(v) ? v[0] : v;

export default async function TasksPage({
  searchParams,
}: {
  searchParams: { [key: string]: string | string[] | undefined };
}) {
  const params = parseTasksParams({
    view: first(searchParams.view),
    project: first(searchParams.project),
    sort: first(searchParams.sort),
    task: first(searchParams.task),
  });

  const [projects, recurrences, recordData] = await Promise.all([
    listProjects(),
    listRecurrences(),
    recordPickerData(),
  ]);
  const projOpts = projects.map((p) => ({
    id: p.id,
    name: p.name,
    color: p.color,
  }));

  // Open set drives every open-task view + the live Overdue count in the bar.
  const openTasks = await listTasks({
    status: "open",
    projectIds: params.projectIds,
  });
  const overdueCount = openTasks.filter((t) => isOverdue(t)).length;

  return (
    <>
      <div className="view-head">
        <span className="view-title">Tasks</span>
      </div>

      {/* CREATE — the add-task bar */}
      <QuickAddTask
        projects={projOpts}
        defaultProjectId={
          params.projectIds.length === 1 ? params.projectIds[0] : undefined
        }
        recordsByProject={recordData.byProject}
        recordLabelByProject={recordData.labelByProject}
      />

      {/* VIEW — the separated control bar */}
      <FilterBar current={params} projects={projOpts} overdueCount={overdueCount} />

      {params.view === "recurring" ? (
        <RecurrenceManager recurrences={recurrences} projects={projOpts} />
      ) : (
        <TasksWorkspace
          tasks={params.view === "completed" ? await listCompletedTasks() : openTasks}
          projects={projOpts}
          recurrences={recurrences}
          view={params.view}
          sort={params.sort}
          initialTaskId={params.task}
        />
      )}
    </>
  );
}
