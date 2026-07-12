import "server-only";

import { serverEnv } from "@/lib/env";

/**
 * Receipt field extraction via OpenAI vision (v1 feature 2). Bare fetch — no
 * SDK — matching lib/transcribe.ts. Model is config-driven
 * (serverEnv.receiptVisionModel, default gpt-4o-mini, swappable to gpt-4o).
 *
 * Uses Structured Outputs (json_schema, strict) so the response is always the
 * exact shape below. Every field is nullable + carries a 0..1 confidence; the
 * confirm UI flags low-confidence fields. The model NEVER auto-files anything —
 * suggested_record_id is a hint, re-validated against the org's records by the
 * caller (the classifier's tenancy pattern).
 */

const OPENAI_CHAT_URL = "https://api.openai.com/v1/chat/completions";

export type ReceiptExtraction = {
  readable: boolean;
  vendor: string | null;
  vendor_confidence: number;
  total: number | null;
  total_confidence: number;
  currency: string | null;
  currency_confidence: number;
  purchased_on: string | null;
  purchased_on_confidence: number;
  suggested_record_id: string | null;
};

const SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: [
    "readable",
    "vendor",
    "vendor_confidence",
    "total",
    "total_confidence",
    "currency",
    "currency_confidence",
    "purchased_on",
    "purchased_on_confidence",
    "suggested_record_id",
  ],
  properties: {
    readable: {
      type: "boolean",
      description:
        "true if this is a legible receipt; false if it is blurry, not a receipt, or unreadable",
    },
    vendor: { type: ["string", "null"], description: "merchant / store name" },
    vendor_confidence: { type: "number", description: "0 to 1" },
    total: {
      type: ["number", "null"],
      description:
        "the grand total actually paid (after tax), the final amount — not the subtotal",
    },
    total_confidence: { type: "number", description: "0 to 1" },
    currency: {
      type: ["string", "null"],
      description:
        "ISO 4217 3-letter code (CAD, USD, EUR…). Infer from symbol + locale; null if unsure",
    },
    currency_confidence: { type: "number", description: "0 to 1" },
    purchased_on: {
      type: ["string", "null"],
      description: "purchase date as YYYY-MM-DD; null if not legible",
    },
    purchased_on_confidence: { type: "number", description: "0 to 1" },
    suggested_record_id: {
      type: ["string", "null"],
      description:
        "id of the candidate record this receipt most likely belongs to, or null if none clearly fits",
    },
  },
} as const;

function systemPrompt(): string {
  return [
    "You read a photo of a purchase receipt and extract structured fields.",
    "Rules:",
    "- Be conservative: if a value is not clearly legible, set it null and its confidence low.",
    "- Never invent a value. Confidence is your honest 0..1 certainty for that field.",
    "- total is the final amount PAID after tax (look for TOTAL / AMOUNT), not the subtotal.",
    "- If the image is blurry, cropped, or not a receipt, set readable=false.",
  ].join("\n");
}

function userPrompt(
  today: string,
  records: { id: string; name: string }[],
): string {
  const lines = [
    `Today is ${today}. Extract the receipt's vendor, total, currency, and purchase date.`,
  ];
  if (records.length > 0) {
    lines.push(
      "If the receipt clearly belongs to one of these records, set suggested_record_id to its id; otherwise null.",
      `Candidate records: ${JSON.stringify(records)}`,
    );
  } else {
    lines.push("There are no candidate records; set suggested_record_id to null.");
  }
  return lines.join("\n");
}

export async function extractReceipt(
  image: { base64: string; mime: string },
  opts: { model: string; today: string; records: { id: string; name: string }[] },
): Promise<ReceiptExtraction> {
  const res = await fetch(OPENAI_CHAT_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${serverEnv.openaiApiKey()}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: opts.model,
      max_tokens: 700,
      messages: [
        { role: "system", content: systemPrompt() },
        {
          role: "user",
          content: [
            { type: "text", text: userPrompt(opts.today, opts.records) },
            {
              type: "image_url",
              image_url: {
                url: `data:${image.mime};base64,${image.base64}`,
                detail: "high",
              },
            },
          ],
        },
      ],
      response_format: {
        type: "json_schema",
        json_schema: {
          name: "receipt_extraction",
          strict: true,
          schema: SCHEMA,
        },
      },
    }),
  });

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new Error(
      `receipt extraction failed (${res.status}): ${detail.slice(0, 300)}`,
    );
  }

  const data = await res.json();
  const message = data?.choices?.[0]?.message;
  if (message?.refusal) {
    throw new Error(`receipt extraction refused: ${message.refusal}`);
  }
  const content = message?.content;
  if (typeof content !== "string") {
    throw new Error("receipt extraction returned no content");
  }
  return JSON.parse(content) as ReceiptExtraction;
}
