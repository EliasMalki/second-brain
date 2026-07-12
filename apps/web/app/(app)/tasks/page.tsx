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
import { todayISO } from "@/lib/dates";

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

  // Open set drives every open-task view + the live pulse counts in the header.
  const openTasks = await listTasks({
    status: "open",
    projectIds: params.projectIds,
  });
  const today = todayISO();
  const overdueCount = openTasks.filter((t) => isOverdue(t, today)).length;
  const todayCount = openTasks.filter(
    (t) => !isOverdue(t, today) && (t.scheduled_for === today || t.due_date === today),
  ).length;

  const tasks =
    params.view === "completed" ? await listCompletedTasks() : openTasks;

  const quickAdd = (
    <QuickAddTask
      variant="command"
      projects={projOpts}
      defaultProjectId={
        params.projectIds.length === 1 ? params.projectIds[0] : undefined
      }
      recordsByProject={recordData.byProject}
      recordLabelByProject={recordData.labelByProject}
    />
  );
  const filterBar = (
    <FilterBar current={params} projects={projOpts} overdueCount={overdueCount} />
  );
  const recurring =
    params.view === "recurring" ? (
      <RecurrenceManager recurrences={recurrences} projects={projOpts} />
    ) : null;

  return (
    <TasksWorkspace
      tasks={tasks}
      projects={projOpts}
      recurrences={recurrences}
      view={params.view}
      sort={params.sort}
      initialTaskId={params.task}
      recordsByProject={recordData.byProject}
      recordLabelByProject={recordData.labelByProject}
      recordNameById={recordData.nameById}
      openCount={openTasks.length}
      overdueCount={overdueCount}
      todayCount={todayCount}
      quickAdd={quickAdd}
      filterBar={filterBar}
      recurring={recurring}
    />
  );
}
