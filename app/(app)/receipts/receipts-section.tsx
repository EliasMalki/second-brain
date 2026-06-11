import { listReceipts, signedPhotoUrl, sumAmounts } from "@/lib/db/receipts";
import { formatCAD } from "../records/records-section";
import { ReceiptForm } from "./receipt-form";
import { DeleteReceiptButton } from "./delete-receipt-button";

/**
 * §10 receipts: list + total + manual-entry form. On a record page pass
 * recordId (the receipt attaches to both); on a project page just projectId.
 */
export async function ReceiptsSection({
  projectId,
  recordId,
}: {
  projectId: string;
  recordId?: string;
}) {
  const receipts = await listReceipts(
    recordId ? { recordId } : { projectId },
  );

  // signed URLs (1 h) for the few rows that have a photo — never public links
  const photoUrls = new Map<string, string>();
  for (const r of receipts) {
    if (!r.photo_path) continue;
    const url = await signedPhotoUrl(r.photo_path);
    if (url) photoUrls.set(r.id, url);
  }

  return (
    <div className="card">
      <div className="section-head">
        <h2 className="label">Receipts</h2>
        {receipts.length > 0 ? (
          <span className="count">total {formatCAD(sumAmounts(receipts))}</span>
        ) : null}
      </div>

      {receipts.length === 0 ? (
        <p className="help">No receipts yet.</p>
      ) : (
        <ul className="item-list">
          {receipts.map((r) => (
            <li key={r.id} className="item-row">
              <span className="title" style={{ flex: 1 }}>
                {r.vendor ?? "—"}
                {r.note ? <span className="help"> · {r.note}</span> : null}
              </span>
              <span className="meta">
                {r.purchased_on ?? ""}
                {photoUrls.has(r.id) ? (
                  <>
                    {" · "}
                    <a
                      href={photoUrls.get(r.id)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      photo
                    </a>
                  </>
                ) : null}
              </span>
              <span className="meta">
                {Number(r.amount ?? 0).toFixed(2)} {r.currency}
              </span>
              <DeleteReceiptButton
                receiptId={r.id}
                projectId={projectId}
                recordId={recordId}
              />
            </li>
          ))}
        </ul>
      )}

      <details style={{ marginTop: "0.75rem" }}>
        <summary className="help" style={{ cursor: "pointer" }}>
          Add a receipt
        </summary>
        <ReceiptForm projectId={projectId} recordId={recordId} />
      </details>
    </div>
  );
}
