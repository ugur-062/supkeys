import { describe, expect, it } from "vitest";
import type { ListingDetail } from "@/hooks/use-company-listings";
import {
  mapDetailToForm,
  toDateInput,
  toLocalInput,
} from "../map-detail-to-form";

const detail = {
  id: "l1",
  title: "Çelik alımı",
  description: "açıklama",
  type: "ALIM",
  format: "RFQ",
  status: "OPEN",
  visibility: "PUBLIC",
  isInternational: false,
  targetCountries: [],
  closesAt: "2026-07-05T11:30:00.000Z",
  bidsOpenAt: null,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  paymentTerm: "CASH",
  items: [
    {
      id: "i1",
      name: "Çelik",
      quantity: "5",
      unit: "ton",
      questions: [],
    },
  ],
  invitations: [
    { companyName: "A", rothernId: "ROT-0001" },
    { companyName: "B", rothernId: null },
  ],
} as unknown as ListingDetail;

describe("toLocalInput / toDateInput", () => {
  it("null/boş → ''", () => {
    expect(toLocalInput(null)).toBe("");
    expect(toDateInput(undefined)).toBe("");
  });
  it("geçersiz ISO → ''", () => {
    expect(toLocalInput("xx")).toBe("");
  });
  it("geçerli ISO → biçim", () => {
    expect(toDateInput("2026-07-05T11:30:00.000Z")).toBe("2026-07-05");
    expect(toLocalInput("2026-07-05T11:30:00.000Z")).toMatch(
      /^2026-07-05T\d{2}:\d{2}$/,
    );
  });
});

describe("mapDetailToForm", () => {
  it("düzenleme: alanlar detaydan gelir", () => {
    const f = mapDetailToForm(detail);
    expect(f.title).toBe("Çelik alımı");
    expect(f.type).toBe("RFQ");
    expect(f.items[0]).toMatchObject({ name: "Çelik", quantity: 5, unit: "ton" });
    expect(f.bidsCloseAt).not.toBe(""); // closesAt taşınır
    expect(f.invitedSupplierIds).toEqual(["ROT-0001"]); // null rothernId atılır
  });

  it("kopya: başlığa (kopya) eklenir, tarihler boşaltılır", () => {
    const f = mapDetailToForm(detail, { forCopy: true });
    expect(f.title).toBe("Çelik alımı (kopya)");
    expect(f.bidsCloseAt).toBe("");
    expect(f.bidsOpenAt).toBe("");
  });
});
