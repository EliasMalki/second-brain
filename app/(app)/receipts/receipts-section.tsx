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
      <p className="card-label">
        <i className="ti ti-receipt" aria-hidden="true" />
        Receipts
      </p>

      {receipts.length === 0 ? (
        <p className="help">No receipts yet.</p>
      ) : (
        <>
          <div className="receipt-total">
            <span className="amt">{formatCAD(sumAmounts(receipts))}</span>
            <span className="view-sub">
              spent · {receipts.length} receipt
              {receipts.length === 1 ? "" : "s"}
            </span>
          </div>
          {receipts.map((r) => (
            <div key={r.id} className="receipt-row">
              <span style={{ minWidth: 0 }}>
                {r.vendor ?? "—"}
                {r.purchased_on ? (
                  <span className="view-sub"> · {r.purchased_on}</span>
                ) : null}
              </span>
              <span style={{ display: "flex", alignItems: "center", gap: 8 }}>
                {photoUrls.has(r.id) ? (
                  <a href={photoUrls.get(r.id)} target="_blank" rel="noreferrer">
                    <i className="ti ti-photo" aria-hidden="true" />
                  </a>
                ) : null}
                <span style={{ color: "var(--color-text-primary)" }}>
                  {Number(r.amount ?? 0).toFixed(2)} {r.currency}
                </span>
                <DeleteReceiptButton
                  receiptId={r.id}
                  projectId={projectId}
                  recordId={recordId}
                />
              </span>
            </div>
          ))}
        </>
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
