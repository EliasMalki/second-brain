/**
 * CSS-only skeleton placeholders shown via route loading.tsx files while the
 * server fetches. Proportioned to the real rows so there's no layout jump.
 */

function w(pct: number): React.CSSProperties {
  return { width: `${pct}%` };
}

/** A header placeholder (title bar) matching .view-head height. */
export function SkeletonHead() {
  return (
    <div className="view-head" aria-hidden="true">
      <div className="sk sk-line" style={{ width: 120, height: 20 }} />
      <div className="sk sk-line" style={{ width: 80 }} />
    </div>
  );
}

/** N task rows: complete circle + priority chip + two text lines. */
export function SkeletonTaskRows({ count = 3 }: { count?: number }) {
  return (
    <ul className="tasks" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li className="task-item" key={i}>
          <span className="sk sk-circle" />
          <span className="sk sk-chip" />
          <div className="task-body" style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="sk sk-line" style={w(48 + ((i * 13) % 30))} />
            <div className="sk sk-line" style={{ ...w(28), height: 9 }} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** N inbox feed cards: icon circle + two lines. */
export function SkeletonFeed({ count = 3 }: { count?: number }) {
  return (
    <ul className="feed" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <li className="feed-item" key={i}>
          <span className="sk sk-ic" />
          <div className="feed-body" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <div className="sk sk-line" style={{ ...w(22), height: 9 }} />
            <div className="sk sk-line" style={w(70 - ((i * 9) % 20))} />
          </div>
        </li>
      ))}
    </ul>
  );
}

/** A card with a label and N text lines (notes list, generic). */
export function SkeletonCard({
  icon = true,
  lines = 3,
}: {
  icon?: boolean;
  lines?: number;
}) {
  return (
    <div className="card" aria-hidden="true">
      <div className="card-label">
        {icon ? <span className="sk" style={{ width: 15, height: 15, borderRadius: 4 }} /> : null}
        <span className="sk sk-line" style={{ width: 90 }} />
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 6 }}>
        {Array.from({ length: lines }).map((_, i) => (
          <div className="sk sk-line" key={i} style={w(90 - ((i * 17) % 40))} />
        ))}
      </div>
    </div>
  );
}
