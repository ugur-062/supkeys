import { describe, expect, it } from "vitest";
import { countTurkishLiterals } from "../scan-literals";

describe("countTurkishLiterals", () => {
  it("dize, şablon ve JSX metnini sayar; yorum ve tanımlayıcıyı saymaz", () => {
    const src = `
      // Yorum: ihale değil talep — SAYILMAZ
      /* Çok satırlı yorum — SAYILMAZ */
      const başlık = "Taleplerim";            // Türkçe ÖZEL harf yok → 0 (sezgisel sınırı)
      const b = 'Kaydedildi';                  // Türkçe harf yok → 0
      const c = \`Toplam \${n} öğe\`;          // şablon kuyruğu "öğe" → 1
      export function X() {
        return <p title="Sil">Kayıt bulunamadı</p>;   // JSX metni → 1, title Türkçe harf yok
      }
    `;
    expect(countTurkishLiterals(src, "x.tsx")).toBe(2);
  });

  it("özel harfli literal sayılır", () => {
    expect(countTurkishLiterals('const a = "Başlık";', "a.ts")).toBe(1);
  });

  it("boş dosya ve saf İngilizce sıfır", () => {
    expect(countTurkishLiterals("", "a.ts")).toBe(0);
    expect(countTurkishLiterals('const a = "hello"; const b = `x${1}y`;', "a.ts")).toBe(0);
  });
});
