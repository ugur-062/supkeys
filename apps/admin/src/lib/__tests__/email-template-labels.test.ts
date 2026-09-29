import { readFileSync } from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { EMAIL_TEMPLATE_LABELS, getTemplateLabel } from "../email-logs/status";

// Derin denetim LU-13: şablon filtresi yalnız artık üretilmeyen demo
// şablonlarını sunuyordu. Nöbetçi: packages/email şablon birliğindeki her
// şablonun admin etiketi olmalı.
describe("EMAIL_TEMPLATE_LABELS", () => {
  it("packages/email EmailTemplateData birliğinin tüm şablonlarını kapsar", () => {
    const src = readFileSync(
      path.resolve(__dirname, "../../../../../packages/email/src/types.ts"),
      "utf8",
    );
    const union = src.slice(src.indexOf("export type EmailTemplateData"));
    const templates = [...union.slice(0, union.indexOf("\nexport ", 1)).matchAll(/template:\s*"([a-z_]+)"/g)].map((m) => m[1]);
    expect(templates.length).toBeGreaterThanOrEqual(5);
    for (const t of templates) expect(EMAIL_TEMPLATE_LABELS).toHaveProperty(t);
    expect(EMAIL_TEMPLATE_LABELS).toHaveProperty("suppression_clear");
  });

  it("artık üretilmeyen demo şablonlarını sunmaz; bilinmeyen anahtar ham döner", () => {
    expect(EMAIL_TEMPLATE_LABELS).not.toHaveProperty("demo_request_received");
    expect(getTemplateLabel("unknown_tpl")).toBe("unknown_tpl");
  });
});
