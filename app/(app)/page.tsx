import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
} from "@/lib/db/tasks";
import { TaskRow } from "./tasks/task-row";
import { todayISO } from "@/lib/dates";

export default async function TodayPage() {
  const today = todayISO();
  const [overdue, todays, projects] = await Promise.all([
    listOverdueTasks(),
    listTasksScheduledBetween(today, today),
    listProjects({ includeArchived: true }),
  ]);
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  const heading = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const nothing = overdue.length === 0 && todays.length === 0;

  return (
    <>
      <div className="page-head">
        <h1>Today</h1>
        <span className="help">{heading}</span>
      </div>

      <div className="stack">
        {nothing ? (
          <div className="card empty">
            Nothing scheduled for today — you&apos;re clear. ✨
            <div style={{ marginTop: "var(--space-3)" }}>
              <Link href="/tasks" className="btn">
                Go to tasks
              </Link>
            </div>
          </div>
        ) : null}

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

        {todays.length > 0 ? (
          <section>
            <h2 className="section-head">
              Today <span className="count">{todays.length}</span>
            </h2>
            <ul className="item-list">
              {todays.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                  showScheduled={false}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
