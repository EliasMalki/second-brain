import { listProjects } from "@/lib/db/projects";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
} from "@/lib/db/tasks";
import { TaskRow } from "../tasks/task-row";
import { SaveViewSnapshot } from "../view-snapshot";
import { EmptyState } from "../empty-state";
import { addDaysISO, dateRange, fmtDayLabel, todayISO } from "@/lib/dates";

const SPAN = 7;

export default async function WeekPage() {
  const today = todayISO();
  const end = addDaysISO(today, SPAN - 1);
  const days = dateRange(today, SPAN);

  const [overdue, week, projects] = await Promise.all([
    listOverdueTasks(),
    listTasksScheduledBetween(today, end),
    listProjects({ includeArchived: true }),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  const byDay = (iso: string) => week.filter((t) => t.scheduled_for === iso);

  return (
    <>
      <div className="view-head">
        <span className="view-title">This week</span>
        <span className="view-sub">Next 7 days</span>
      </div>

      <SaveViewSnapshot
        view="week"
        tasks={[
          ...overdue.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: "overdue",
            project: projectName(t.project_id),
          })),
          ...week.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: t.scheduled_for ?? "",
            project: projectName(t.project_id),
          })),
        ]}
      />

      <div className="stack">
        {overdue.length === 0 && week.length === 0 ? (
          <EmptyState icon="ti-calendar-smile" title="Clear week ahead." />
        ) : null}

        {overdue.length > 0 ? (
          <section>
            <p className="day-head" style={{ color: "var(--color-text-warning)" }}>
              Overdue · {overdue.length}
            </p>
            <ul className="tasks">
              {overdue.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                />
              ))}
            </ul>
          </section>
        ) : null}

        {overdue.length === 0 && week.length === 0
          ? null
          : days.map((iso) => {
          const dayTasks = byDay(iso);
          return (
            <section key={iso}>
              <p className="day-head">
                {fmtDayLabel(iso)}
                {dayTasks.length > 0 ? ` · ${dayTasks.length}` : ""}
              </p>
              {dayTasks.length > 0 ? (
                <ul className="tasks">
                  {dayTasks.map((t) => (
                    <TaskRow
                      key={t.id}
                      task={t}
                      projectName={projectName(t.project_id)}
                      showScheduled={false}
                    />
                  ))}
                </ul>
              ) : (
                <p className="muted-note">—</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
