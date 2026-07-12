/**
 * Notes route skeleton — the three-pane shell (folders · list · editor) so
 * navigation doesn't flash the generic task-row fallback before hydration.
 */
export default function NotesLoading() {
  return (
    <div className="notes-workspace" aria-hidden="true">
      <div className="notes-org">
        <div className="sk sk-line" style={{ width: 70, height: 12, margin: 12 }} />
        {[80, 64, 72, 56].map((wd, i) => (
          <div
            key={i}
            className="sk sk-line"
            style={{ width: wd, height: 13, margin: "10px 14px" }}
          />
        ))}
      </div>
      <div className="notes-list">
        <div className="sk sk-line" style={{ width: 90, height: 14, margin: 14 }} />
        {[92, 78, 85].map((wd, i) => (
          <div key={i} style={{ padding: "10px 14px", display: "flex", flexDirection: "column", gap: 7 }}>
            <div className="sk sk-line" style={{ width: `${wd}%`, height: 13 }} />
            <div className="sk sk-line" style={{ width: "50%", height: 9 }} />
          </div>
        ))}
      </div>
      <section className="notes-editor">
        <div className="note-editor" style={{ display: "flex", flexDirection: "column", gap: 14, padding: 20 }}>
          <div className="sk sk-line" style={{ width: "40%", height: 22 }} />
          <div className="sk sk-line" style={{ width: "90%", height: 12 }} />
          <div className="sk sk-line" style={{ width: "85%", height: 12 }} />
          <div className="sk sk-line" style={{ width: "70%", height: 12 }} />
        </div>
      </section>
    </div>
  );
}
