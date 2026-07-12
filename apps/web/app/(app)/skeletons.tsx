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

/** The redesigned Inbox: group headers + cards (icon tile, two lines, action
 *  pills), proportioned to .inbox2 so the loaded page doesn't jump. */
export function SkeletonInbox() {
  return (
    <div className="inbox2" aria-hidden="true">
      <div className="view-head">
        <div className="sk sk-line" style={{ width: 120, height: 20 }} />
        <div className="sk sk-line" style={{ width: 70 }} />
      </div>
      {[3, 2].map((cards, g) => (
        <div key={g}>
          <div className="ibx-grp">
            <span className="sk sk-line" style={{ width: 90, height: 10 }} />
          </div>
          {Array.from({ length: cards }).map((_, i) => (
            <div className="ibx-card" key={i}>
              <div className="ibx-row">
                <span className="sk" style={{ width: 30, height: 30, borderRadius: 8 }} />
                <div
                  className="ibx-body"
                  style={{ display: "flex", flexDirection: "column", gap: 7 }}
                >
                  <div className="sk sk-line" style={w(58 + ((i * 13 + g * 7) % 28))} />
                  <div className="sk sk-line" style={{ ...w(24), height: 9 }} />
                </div>
              </div>
              <div className="ibx-actions">
                <span className="sk" style={{ width: 132, height: 32, borderRadius: 6 }} />
                <span className="sk" style={{ width: 104, height: 32, borderRadius: 6 }} />
              </div>
            </div>
          ))}
        </div>
      ))}
    </div>
  );
}

/** A grid of project-card placeholders for the Projects index. */
export function SkeletonProjectGrid({ count = 4 }: { count?: number }) {
  return (
    <div className="pgrid" aria-hidden="true">
      {Array.from({ length: count }).map((_, i) => (
        <div className="pcard" key={i}>
          <div className="pcard-head">
            <span className="sk" style={{ width: 9, height: 9, borderRadius: 999 }} />
            <span className="sk sk-line" style={{ width: 90 }} />
          </div>
          <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 6 }}>
            <div className="sk sk-line" style={w(92)} />
            <div className="sk sk-line" style={w(60)} />
          </div>
          <div className="pcard-stats" style={{ gap: 10 }}>
            <span className="sk sk-line" style={{ width: 48, height: 10 }} />
            <span className="sk sk-line" style={{ width: 48, height: 10 }} />
          </div>
        </div>
      ))}
    </div>
  );
}

/** Records board placeholder: a header row + columns of card placeholders. */
export function SkeletonBoard({
  cols = 3,
  cards = 2,
}: {
  cols?: number;
  cards?: number;
}) {
  return (
    <div aria-hidden="true">
      <div className="rec-head">
        <span className="sk sk-line" style={{ width: 90, height: 14 }} />
        <span
          className="sk"
          style={{ width: 96, height: 30, marginLeft: "auto", borderRadius: 6 }}
        />
      </div>
      <div className="board">
        {Array.from({ length: cols }).map((_, c) => (
          <div className="bcol" key={c}>
            <div className="bcol-head">
              <span className="sk" style={{ width: 7, height: 7, borderRadius: 999 }} />
              <span className="sk sk-line" style={{ width: 60 }} />
            </div>
            <div className="bcol-cards">
              {Array.from({ length: cards }).map((_, i) => (
                <div className="rcard" key={i} style={{ cursor: "default", gap: 8 }}>
                  <span className="sk sk-line" style={w(58 + ((i * 17) % 30))} />
                  <span className="sk sk-line" style={{ width: 52, height: 10 }} />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
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
