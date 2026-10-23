import { describe, expect, it } from "vitest";

import { lostBidOutcome } from "../lost-bid-outcome";

describe("lostBidOutcome", () => {
  it("alıcının elemesi 'eliminated'", () => {
    expect(lostBidOutcome({ eliminatedAt: "2026-10-01T00:00:00Z", eliminationReason: "Fiyat yüksek" }, "OPEN")).toBe(
      "eliminated",
    );
  });

  it("satıcının kendi sipariş reddi 'orderRejected' — eliminatedAt dolu olsa da 'Elendi' değil (arayüz testi son tur)", () => {
    const at = "2026-10-01T00:00:00Z";
    // Sunucu bayrağı (sahip/tekliflerim listeleri gerekçeyi taşımaz).
    expect(lostBidOutcome({ eliminatedAt: at, orderRejected: true }, "AWARDED")).toBe("orderRejected");
    // Kodlu gerekçe (teklifçinin kendi teklifi gerekçeyi taşır).
    expect(lostBidOutcome({ eliminatedAt: at, eliminationReason: "[[ORDER_REJECTED]] stok bitti" }, "AWARDED")).toBe(
      "orderRejected",
    );
    expect(lostBidOutcome({ eliminatedAt: at, eliminationReason: "[[ORDER_REJECTED]]" }, "IN_AWARD")).toBe(
      "orderRejected",
    );
    // Eski Türkçe kayıt da tanınır.
    expect(
      lostBidOutcome({ eliminatedAt: at, eliminationReason: "Sipariş satıcı tarafından reddedildi: stok bitti" }, "AWARDED"),
    ).toBe("orderRejected");
  });

  it("elenmemiş LOST talep durumuna göre", () => {
    expect(lostBidOutcome({ eliminatedAt: null, orderRejected: false }, "AWARDED")).toBe("lost");
    expect(lostBidOutcome({}, "CANCELLED")).toBe("cancelled");
    expect(lostBidOutcome({}, "CLOSED_NO_AWARD")).toBe("closed");
  });
});
