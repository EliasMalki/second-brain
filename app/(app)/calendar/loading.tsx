/**
 * Calendar route skeleton — a nav row + a week-grid placeholder, so navigating
 * to the (network-fetching) calendar doesn't flash the generic task-row
 * fallback and then jump to a grid.
 */
export default function CalendarLoading() {
  return (
    <div aria-hidden="true">
      <div className="view-head">
        <div className="sk sk-line" style={{ width: 130, height: 22 }} />
        <div className="sk sk-line" style={{ width: 90, height: 30, borderRadius: 8 }} />
      </div>
      <div
        className="sk"
        style={{
          height: "60vh",
          minHeight: 380,
          borderRadius: 14,
          marginTop: 12,
        }}
      />
    </div>
  );
}
