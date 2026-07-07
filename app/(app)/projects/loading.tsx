export default function Loading() {
  return (
    <div className="projs" aria-hidden="true">
      <div className="pl-head">
        <span className="sk sk-line" style={{ width: 130, height: 22 }} />
        <span className="sk sk-line" style={{ width: 90, height: 12 }} />
      </div>
      <div className="pl-pulse">
        {Array.from({ length: 4 }).map((_, i) => (
          <div className="pl-tile" key={i}>
            <div className="sk sk-line" style={{ width: 44, height: 20 }} />
            <div
              className="sk sk-line"
              style={{ width: 84, height: 10, marginTop: 8 }}
            />
          </div>
        ))}
      </div>
      <div className="pl-add" style={{ height: 50 }} />
      <div className="pl-group">
        <p className="pl-glabel">
          <span className="sk sk-line" style={{ width: 70, height: 10 }} />
          <span className="ln" />
        </p>
        <div className="pl-grid">
          {Array.from({ length: 4 }).map((_, i) => (
            <div className="pc" key={i}>
              <div
                className="pc-band"
                style={{ background: "var(--color-background-tertiary)" }}
              >
                <span className="sk sk-line" style={{ width: 90, height: 14 }} />
              </div>
              <div className="pc-body">
                <div className="sk sk-line" style={{ width: "92%" }} />
                <div className="sk sk-line" style={{ width: "60%", marginTop: 6 }} />
              </div>
              <div className="pc-prog">
                <div className="bar" />
              </div>
              <div className="pc-foot">
                <span className="sk sk-line" style={{ width: 48, height: 10 }} />
                <span className="sk sk-line" style={{ width: 48, height: 10 }} />
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
