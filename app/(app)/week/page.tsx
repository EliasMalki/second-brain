import { listProjects } from "@/lib/db/projects";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
} from "@/lib/db/tasks";
import { TaskRow } from "../tasks/task-row";
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
      <div className="page-head">
        <h1>Week</h1>
        <span className="help">Next 7 days</span>
      </div>

      <div className="stack">
        {overdue.length > 0 ? (
          <section>
            <h2 className="section-head section-head-warn">
              Overdue <span className="count">{overdue.length}</span>
            </h2>
            <ul className="item-list">
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

        {days.map((iso) => {
          const dayTasks = byDay(iso);
          return (
            <section key={iso}>
              <h2 className="section-head">
                {fmtDayLabel(iso)}
                {dayTasks.length > 0 ? (
                  <span className="count">{dayTasks.length}</span>
                ) : null}
              </h2>
              {dayTasks.length > 0 ? (
                <ul className="item-list">
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
                <p className="day-empty">—</p>
              )}
            </section>
          );
        })}
      </div>
    </>
  );
}
