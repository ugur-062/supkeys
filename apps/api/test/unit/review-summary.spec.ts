import {
  buildReviewSummary,
  type ReviewSummaryRow,
} from "../../src/modules/company-reviews/review-summary";

/**
 * Değerlendirme özeti — firma bazında gruplama, firma-ağırlıklı ortalama,
 * ad görünürlüğü (revealNames × showName), rol türetme, yorum tavanı.
 */
const d = (iso: string) => new Date(iso);
const row = (o: Partial<ReviewSummaryRow> & { reviewerCompanyId: string; rating: number }): ReviewSummaryRow => ({
  comment: null,
  createdAt: d("2026-08-01T00:00:00Z"),
  showName: false,
  reviewer: { name: `Firma ${o.reviewerCompanyId}` },
  order: { buyerCompanyId: o.reviewerCompanyId }, // varsayılan: değerlendiren alıcı
  ...o,
});

describe("buildReviewSummary", () => {
  it("firma bazında gruplar; genel puan ORTAK ortalamalarının ortalaması (tek büyük müşteri domine edemez)", () => {
    const rows = [
      // A firması 10 sipariş hep 5 yıldız
      ...Array.from({ length: 10 }, (_, i) => row({ reviewerCompanyId: "A", rating: 5, createdAt: d(`2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`) })),
      // B firması 1 sipariş 1 yıldız
      row({ reviewerCompanyId: "B", rating: 1, createdAt: d("2026-08-10T00:00:00Z") }),
    ];
    const s = buildReviewSummary(rows, { revealNames: false });
    expect(s.orders).toBe(11);
    expect(s.firms).toBe(2);
    expect(s.avg).toBe(3); // (5 + 1) / 2 — sipariş-ağırlıklı olsaydı 4,6 olurdu
    expect(s.distribution).toEqual({ 5: 10, 4: 0, 3: 0, 2: 0, 1: 1 });
    expect(s.partners.map((p) => [p.count, p.avg])).toEqual([
      [1, 1], // en yeni önce (B, 10 Ağustos)
      [10, 5],
    ]);
  });

  it("ad görünürlüğü: revealNames=false → hep null; revealNames=true → yalnız en son değerlendirme showName ise", () => {
    const rows = [
      row({ reviewerCompanyId: "A", rating: 4, showName: true, createdAt: d("2026-08-05T00:00:00Z") }),
      row({ reviewerCompanyId: "A", rating: 5, showName: false, createdAt: d("2026-07-01T00:00:00Z") }),
      row({ reviewerCompanyId: "B", rating: 3, showName: false, createdAt: d("2026-08-06T00:00:00Z") }),
      row({ reviewerCompanyId: "C", rating: 2, showName: false, createdAt: d("2026-08-07T00:00:00Z") }),
      row({ reviewerCompanyId: "C", rating: 5, showName: true, createdAt: d("2026-06-01T00:00:00Z") }), // eski opt-in, en son kapalı → gizli
    ];
    const pub = buildReviewSummary(rows, { revealNames: false });
    expect(pub.partners.every((p) => p.name === null)).toBe(true);
    const inApp = buildReviewSummary(rows, { revealNames: true });
    const byRole = Object.fromEntries(inApp.partners.map((p) => [p.count + "-" + p.avg, p.name]));
    expect(inApp.partners.find((p) => p.name === "Firma A")).toBeTruthy();
    expect(inApp.partners.filter((p) => p.name !== null)).toHaveLength(1);
    void byRole;
  });

  it("rol siparişten türetilir (alıcı/tedarikçi); yorumlar en yeni önce, en fazla 5, boşlar atılır", () => {
    const rows = [
      row({ reviewerCompanyId: "S", rating: 4, order: { buyerCompanyId: "OTHER" }, comment: "  ", createdAt: d("2026-08-09T00:00:00Z") }),
      ...Array.from({ length: 7 }, (_, i) =>
        row({
          reviewerCompanyId: "S",
          rating: 5,
          order: { buyerCompanyId: "OTHER" },
          comment: `Yorum ${i}`,
          createdAt: d(`2026-07-${String(i + 1).padStart(2, "0")}T00:00:00Z`),
        }),
      ),
    ];
    const s = buildReviewSummary(rows, { revealNames: true });
    expect(s.partners).toHaveLength(1);
    const p = s.partners[0]!;
    expect(p.role).toBe("seller");
    expect(p.count).toBe(8);
    expect(p.comments).toHaveLength(5);
    expect(p.comments[0]!.comment).toBe("Yorum 6"); // en yeni
    expect(p.lastAt).toBe("2026-08-09T00:00:00.000Z");
  });

  it("değerlendirme yoksa sıfır özet", () => {
    expect(buildReviewSummary([], { revealNames: true })).toEqual({
      avg: 0,
      firms: 0,
      orders: 0,
      distribution: { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 },
      partners: [],
    });
  });
});
