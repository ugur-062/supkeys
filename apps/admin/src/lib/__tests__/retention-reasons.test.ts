import { describe, expect, it } from "vitest";
import { anonymizedMessage, retentionReasonsText } from "../retention-reasons";

describe("retention-reasons (D-143)", () => {
  it("siparişsiz firmada sipariş değil gerçek izleri sayar", () => {
    const msg = anonymizedMessage({ membershipEvents: 2, complaintsMade: 1 });
    expect(msg).toContain("üyelik geçmişi (2)");
    expect(msg).toContain("yaptığı şikayet (1)");
    expect(msg).not.toMatch(/sipariş/);
  });

  it("sıfır adetleri atlar, bilinmeyen anahtarı ham gösterir", () => {
    expect(retentionReasonsText({ ordersAsBuyer: 0, yeniIz: 3 })).toBe("yeniIz (3)");
  });

  it("neden yoksa genel metin", () => {
    expect(anonymizedMessage(undefined)).toBe(
      "Firma anonimleştirildi — geçmiş kayıtlar korundu",
    );
  });
});
