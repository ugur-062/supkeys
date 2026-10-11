/**
 * TİCARİ ŞARTLAR PANELİ — teklif kuralı özeti (arayüz testi D-240, T-16):
 * "Tedarikçi ne görür"ün beş seçeneği kendi özetini taşır; kapalı zarf sabit.
 */
import { describe, expect, it } from "vitest";
import { bidVisibilitySummary } from "../terms-panel";

describe("bidVisibilitySummary", () => {
  it("beş görünürlük kodu ayrı özet anahtarına eşlenir; bilinmeyen kod en kısıtlıya düşer", () => {
    const t = (k: string) => k;
    const keys = ["OWN_ONLY", "BEST_PRICE", "OWN_RANK", "BEST_AND_OWN_RANK", "ALL"].map((c) => bidVisibilitySummary(c, t));
    expect(new Set(keys).size).toBe(5);
    expect(bidVisibilitySummary("BEST_AND_OWN_RANK", t)).toBe("enIyiTeklifVeKendiSirasi");
    expect(bidVisibilitySummary("ALL", t)).toBe("tumTekliflerVeSiralamaAcik");
    expect(bidVisibilitySummary("BILINMEYEN", t)).toBe("yalnizKendiTeklifiniGorur");
  });
});
