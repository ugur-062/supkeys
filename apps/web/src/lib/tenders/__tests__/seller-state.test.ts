import { describe, expect, it } from "vitest";
import {
  closingUrgency,
  deriveSellerTenderState,
} from "../seller-state";

describe("deriveSellerTenderState", () => {
  it("iptal her durumu ezer", () => {
    expect(deriveSellerTenderState("CANCELLED", "WON", true).label).toBe(
      "İptal Edildi",
    );
  });

  it("teklif sonuçları ilan durumundan önce gelir", () => {
    expect(deriveSellerTenderState("AWARDED", "WON", true).label).toBe(
      "Kazandınız",
    );
    expect(
      deriveSellerTenderState("AWARDED", "AWARDED_PARTIAL", true).label,
    ).toBe("Kısmen Kazandınız");
    expect(deriveSellerTenderState("AWARDED", "LOST", true).label).toBe(
      "Kaybettin",
    );
    expect(deriveSellerTenderState("OPEN", "WITHDRAWN", true).label).toBe(
      "Geri Çekildi",
    );
  });

  it("OPEN: taslak/gönderildi/davet/açık ayrımı", () => {
    expect(deriveSellerTenderState("OPEN", "DRAFT", true).label).toBe(
      "Taslak Teklifim",
    );
    expect(deriveSellerTenderState("OPEN", "SUBMITTED", false).label).toBe(
      "Teklif Gönderildi",
    );
    expect(deriveSellerTenderState("OPEN", null, true).label).toBe(
      "Davet Edildi",
    );
    expect(deriveSellerTenderState("OPEN", null, false).label).toBe(
      "Teklife Açık",
    );
  });

  it("kapanış/değerlendirme durumları", () => {
    // "Değerlendiriliyor" YALNIZ alıcının bilinçli sinyalinde (IN_AWARD*);
    // sıradan kapanış nötr "Sonuç Bekleniyor" — ayrım düğmenin anlamı.
    expect(deriveSellerTenderState("CLOSED", "SUBMITTED", false).label).toBe(
      "Sonuç Bekleniyor",
    );
    expect(deriveSellerTenderState("IN_AWARD", "SUBMITTED", false).label).toBe(
      "Değerlendiriliyor",
    );
    // Gönderilmemiş taslak "değerlendirmede" DEĞİL (denetim düzeltmesi).
    expect(deriveSellerTenderState("CLOSED", "DRAFT", true).label).toBe(
      "Kapandı (taslak gönderilmedi)",
    );
    expect(deriveSellerTenderState("CLOSED", null, true).label).toBe("Kapandı");
    expect(
      deriveSellerTenderState("IN_AWARD_APPROVAL", "SUBMITTED", false).label,
    ).toBe("Değerlendiriliyor");
    expect(deriveSellerTenderState("AWARDED", null, false).label).toBe(
      "Kapandı (teklif vermedin)",
    );
    expect(
      deriveSellerTenderState("CLOSED_NO_AWARD", "SUBMITTED", false).label,
    ).toBe("Kapandı");
  });
});

describe("closingUrgency", () => {
  const iso = (days: number) =>
    new Date(Date.now() + days * 86_400_000).toISOString();

  it("OPEN değilse veya tarih yoksa null", () => {
    expect(closingUrgency("CLOSED", iso(2))).toBeNull();
    expect(closingUrgency("OPEN", null)).toBeNull();
  });

  it("aciliyet renkleri: ≤1g rose, ≤3g amber, uzak zinc", () => {
    expect(closingUrgency("OPEN", iso(0.5))!.className).toContain("rose");
    expect(closingUrgency("OPEN", iso(2.5))!.className).toContain("amber");
    expect(closingUrgency("OPEN", iso(10))!.className).toContain("zinc");
  });

  it("metinler: gün kaldı / bugün biter / süre doldu", () => {
    expect(closingUrgency("OPEN", iso(5))!.text).toBe("5 gün kaldı");
    expect(closingUrgency("OPEN", iso(-0.5))!.text).toBe("Bugün biter");
    expect(closingUrgency("OPEN", iso(-2))!.text).toBe("Süre doldu");
  });
});
