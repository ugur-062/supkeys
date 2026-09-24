import { describe, expect, it } from "vitest";
import { wallClock } from "@/lib/time-zone";
import {
  closingUrgency,
  daysUntil,
  deriveSellerTenderState,
} from "../seller-state";

/* i18n Faz 2: durum METNİ katalogda (`web.domain.sellerState.<anahtar>`);
   burada üretilen ANAHTAR sınanır — sözleşme anahtar ↔ durum eşlemesidir. */
describe("deriveSellerTenderState", () => {
  it("iptal her durumu ezer", () => {
    expect(deriveSellerTenderState("CANCELLED", "WON", true).key).toBe("cancelled");
  });

  it("teklif sonuçları ilan durumundan önce gelir", () => {
    expect(deriveSellerTenderState("AWARDED", "WON", true).key).toBe("won");
    expect(deriveSellerTenderState("AWARDED", "AWARDED_PARTIAL", true).key).toBe(
      "wonPartial",
    );
    expect(deriveSellerTenderState("AWARDED", "LOST", true).key).toBe("lost");
    expect(deriveSellerTenderState("OPEN", "WITHDRAWN", true).key).toBe("withdrawn");
  });

  it("OPEN: taslak/gönderildi/davet/açık ayrımı", () => {
    expect(deriveSellerTenderState("OPEN", "DRAFT", true).key).toBe("draftMine");
    expect(deriveSellerTenderState("OPEN", "SUBMITTED", false).key).toBe("submitted");
    expect(deriveSellerTenderState("OPEN", null, true).key).toBe("invited");
    expect(deriveSellerTenderState("OPEN", null, false).key).toBe("open");
  });

  it("kapanış/değerlendirme durumları", () => {
    // "Değerlendiriliyor" YALNIZ alıcının bilinçli sinyalinde (IN_AWARD*);
    // sıradan kapanış nötr "Sonuç Bekleniyor" — ayrım düğmenin anlamı.
    expect(deriveSellerTenderState("CLOSED", "SUBMITTED", false).key).toBe(
      "awaitingResult",
    );
    expect(deriveSellerTenderState("IN_AWARD", "SUBMITTED", false).key).toBe(
      "evaluating",
    );
    // Gönderilmemiş taslak "değerlendirmede" DEĞİL (denetim düzeltmesi).
    expect(deriveSellerTenderState("CLOSED", "DRAFT", true).key).toBe(
      "closedDraftNotSent",
    );
    expect(deriveSellerTenderState("CLOSED", null, true).key).toBe("closed");
    expect(deriveSellerTenderState("IN_AWARD_APPROVAL", "SUBMITTED", false).key).toBe(
      "evaluating",
    );
    expect(deriveSellerTenderState("AWARDED", null, false).key).toBe("closedNoBid");
    expect(deriveSellerTenderState("CLOSED_NO_AWARD", "SUBMITTED", false).key).toBe(
      "closed",
    );
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

  it("kalan gün: takvim günü, ürün saat diliminde", () => {
    expect(daysUntil(iso(5))).toBe(5);
    // TAKVİM günü farkı (C11) — "bugün" vakası saat-bağımsız kurulmalı:
    // `iso(-0.5)` (şimdi − 12 saat) sabah koşularında DÜNE düşüp testi
    // kırıyordu. Bugünün herhangi bir saati her koşuda 0 gün farkı verir.
    // Gün ÜRÜN saat diliminde (Europe/Istanbul, sabit +03) sayılır (2026-09-22)
    // → "bugün" de Türkiye günüdür; test makinesinin TZ'si ne olursa olsun.
    // Metin (`{n} gün kaldı` / `Bugün biter` / `Süre doldu`) katalogdan gelir
    // ve `useClosingUrgency` ile çizilir.
    const todayAt = (hour: number) => {
      const w = wallClock(new Date());
      return new Date(Date.UTC(w.year, w.month - 1, w.day, hour - 3, 0, 0)).toISOString();
    };
    expect(daysUntil(todayAt(1))).toBe(0);
    expect(daysUntil(todayAt(23))).toBe(0);
    expect(daysUntil(iso(-2))).toBeLessThan(0);
  });
});
