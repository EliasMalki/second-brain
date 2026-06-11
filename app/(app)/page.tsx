import Link from "next/link";
import { listProjects } from "@/lib/db/projects";
import {
  listOverdueTasks,
  listTasksScheduledBetween,
  partitionByAvailability,
} from "@/lib/db/tasks";
import { TaskRow } from "./tasks/task-row";
import { CaptureBox } from "./capture-box";
import { BriefCard } from "./brief-card";
import { SaveViewSnapshot } from "./view-snapshot";
import { getFirstOpenBrief } from "@/lib/db/brief";
import { isBusinessHoursNow, todayISO } from "@/lib/dates";

export default async function TodayPage() {
  const today = todayISO();
  const [allOverdue, allTodays, projects, brief] = await Promise.all([
    listOverdueTasks(),
    listTasksScheduledBetween(today, today),
    listProjects({ includeArchived: true }),
    getFirstOpenBrief(),
  ]);

  // Availability-aware (BUILD_SPEC §5): outside 9–5, business-hours tasks
  // move to their own section instead of cluttering the actionable list.
  const inHours = isBusinessHoursNow();
  const [overdueSplit, todaySplit] = await Promise.all([
    partitionByAvailability(allOverdue, inHours),
    partitionByAvailability(allTodays, inHours),
  ]);
  const overdue = overdueSplit.available;
  const todays = todaySplit.available;
  const offHours = [...overdueSplit.offHours, ...todaySplit.offHours];
  const projectName = (id: string | null) =>
    projects.find((p) => p.id === id)?.name ?? null;

  const heading = new Date(`${today}T00:00:00`).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const nothing =
    overdue.length === 0 && todays.length === 0 && offHours.length === 0;

  return (
    <>
      <div className="page-head">
        <h1>Today</h1>
        <span className="help">{heading}</span>
      </div>

      <CaptureBox />

      <SaveViewSnapshot
        view="today"
        tasks={[
          ...overdue.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: "overdue",
            project: projectName(t.project_id),
          })),
          ...todays.map((t) => ({
            title: t.title,
            priority: t.priority,
            section: "today",
            project: projectName(t.project_id),
          })),
        ]}
      />

      {brief ? <BriefCard brief={brief} /> : null}

      <div className="stack" style={{ marginTop: "var(--space-6)" }}>
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

        {offHours.length > 0 ? (
          <section style={{ opacity: 0.6 }}>
            <h2 className="section-head">
              Business hours <span className="count">{offHours.length}</span>
              <span className="help" style={{ marginLeft: "var(--space-2)" }}>
                outside 9–5 — these can wait
              </span>
            </h2>
            <ul className="item-list">
              {offHours.map((t) => (
                <TaskRow
                  key={t.id}
                  task={t}
                  projectName={projectName(t.project_id)}
                />
              ))}
            </ul>
          </section>
        ) : null}
      </div>
    </>
  );
}
