import { describe, expect, it } from "vitest";
import { serializeJsonLd } from "./json-ld";

const LS = "\u2028"; // U+2028 satır ayırıcı
const PS = "\u2029"; // U+2029 paragraf ayırıcı

describe("serializeJsonLd — XSS güvenli JSON-LD gömme", () => {
  it("</script> enjeksiyonu literal olarak sızmaz", () => {
    const payload = { description: "</script><script>alert(1)</script>" };
    const out = serializeJsonLd(payload);

    // Etiketten çıkışa izin verecek hiçbir literal karakter kalmamalı.
    expect(out).not.toContain("</script>");
    expect(out).not.toContain("<");
    expect(out).not.toContain(">");
    // Kaçırılmış unicode formu var.
    expect(out).toContain("\\u003c");
    expect(out).toContain("\\u003e");
  });

  it("çıktı JSON.parse ile orijinal değere geri döner (anlam korunur)", () => {
    const payload = {
      name: "ACME <b>&</b> Co",
      description: "</script><script>alert(1)</script>",
    };
    const out = serializeJsonLd(payload);
    const parsed = JSON.parse(out);

    expect(parsed).toEqual(payload);
    expect(parsed.description).toBe("</script><script>alert(1)</script>");
  });

  it("& karakteri kaçırılır", () => {
    const out = serializeJsonLd({ x: "a & b" });
    expect(out).not.toContain("&");
    expect(out).toContain("\\u0026");
    expect(JSON.parse(out).x).toBe("a & b");
  });

  it("U+2028 / U+2029 satır ayırıcıları kaçırılır", () => {
    const payload = { x: `line${LS}sep${PS}end` };
    const out = serializeJsonLd(payload);

    // Ham U+2028/U+2029 kalmamalı (JS bağlamında geçersiz).
    expect(out).not.toContain(LS);
    expect(out).not.toContain(PS);
    expect(out).toContain("\\u2028");
    expect(out).toContain("\\u2029");
    // Round-trip anlamı korur.
    expect(JSON.parse(out).x).toBe(`line${LS}sep${PS}end`);
  });

  it("zararsız veri geçerli, parse edilebilir JSON kalır", () => {
    const payload = { "@context": "https://schema.org", name: "Örnek A.Ş." };
    const out = serializeJsonLd(payload);
    expect(JSON.parse(out)).toEqual(payload);
  });
});
