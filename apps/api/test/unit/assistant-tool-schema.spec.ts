/**
 * ASİSTAN ARAÇ ŞEMALARI — SAĞLAYICININ REDDETTİĞİ BİÇİMLER (2026-09-15).
 *
 * Canlı bulgu: `request_publish_tender` şeması `required: ["type", …]`
 * taşıyordu ama `type` özelliği satış ilanı kaldırılırken (2026-09-04)
 * silinmişti. Vertex, tanımda olmayan zorunlu alanı "Request contains an
 * invalid argument" ile reddediyor ve araç tanımları HER istekte gittiği için
 * asistan "Merhaba"ya bile yanıt veremiyordu.
 *
 * Kural (her araç, her derinlik): `required` içindeki her ad `properties`te
 * olmalı; `enum` boş olmamalı; `array` şemasının `items`ı olmalı.
 */
import { toolDefsForUser } from "../../src/modules/ai/assistant/assistant-tools";

type Schema = {
  type?: string;
  properties?: Record<string, Schema>;
  required?: string[];
  items?: Schema;
  enum?: unknown[];
};

function problems(schema: Schema, path: string): string[] {
  const out: string[] = [];
  if (schema.required) {
    for (const r of schema.required) {
      if (!schema.properties || !(r in schema.properties)) out.push(`${path}: required "${r}" properties içinde yok`);
    }
  }
  if (schema.enum && schema.enum.length === 0) out.push(`${path}: enum boş`);
  if (schema.type === "array" && !schema.items) out.push(`${path}: array şemasında items yok`);
  for (const [k, v] of Object.entries(schema.properties ?? {})) out.push(...problems(v, `${path}.${k}`));
  if (schema.items) out.push(...problems(schema.items, `${path}[]`));
  return out;
}

describe("asistan araç şemaları", () => {
  const kombinasyonlar: Array<Array<"satinalma" | "satis">> = [[], ["satinalma"], ["satis"], ["satinalma", "satis"]];

  it.each(kombinasyonlar.map((k) => [k.join("+") || "portalsız", k] as const))(
    "%s: her zorunlu alan tanımlı, enum dolu, dizi öğesi belirli",
    (_ad, portals) => {
      const defs = toolDefsForUser(new Set(portals));
      const hatalar = defs.flatMap((d) => problems(d.parameters as Schema, d.name));
      expect(hatalar).toEqual([]);
    },
  );

  it("araç adları tekil", () => {
    const defs = toolDefsForUser(new Set(["satinalma", "satis"]));
    const adlar = defs.map((d) => d.name);
    expect(new Set(adlar).size).toBe(adlar.length);
  });
});
