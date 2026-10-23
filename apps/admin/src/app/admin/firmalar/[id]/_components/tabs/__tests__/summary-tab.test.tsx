// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() } }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn() }) }));
vi.mock("@/hooks/use-admin-auth", () => ({ useAdminAuth: () => ({ admin: { role: "SALES" } }) }));
vi.mock("@/lib/api", () => ({ api: { get: vi.fn(), delete: vi.fn() } }));
vi.mock("@/hooks/use-admin-companies", () => ({
  useUpdateCompanyProfile: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { SummaryTab } from "../summary-tab";

function data(over: Record<string, unknown> = {}) {
  return {
    id: "c1",
    rothernId: "RT-1",
    name: "Muster",
    legalName: "Muster GmbH",
    taxNumber: "DE811569869",
    taxOffice: null,
    country: "DE",
    stateRegion: "Bayern",
    city: "Munich",
    district: null,
    neighborhood: null,
    postalCode: "80331",
    companyType: "OTHER",
    legalFormLocal: "GmbH",
    authorizedTckn: "C01***89",
    addressLine: "Marienplatz 1",
    billingEmail: null,
    industry: null,
    website: null,
    iban: null,
    ibanHolder: null,
    mersisNo: null,
    tradeRegistryNo: null,
    companyVerifiedAt: null,
    companyRejectionReason: null,
    createdAt: "2026-09-27T10:00:00.000Z",
    _count: { users: 1, listings: 0, complaintsReceived: 0 },
    openComplaints: 0,
    suppressions: [],
    vies: null,
    viesSupported: true,
    ...over,
  } as never;
}

/**
 * Admin özeti (2026-09-27): hukuki yapı (yerel ad + platform türü), posta
 * kodu, maskeli yetkili kimliği, VIES sonucu ve kodlu red gerekçesi.
 */
describe("SummaryTab — kimlik bilgileri", () => {
  it("hukuki yapının yerel adını, posta kodunu ve maskeli yetkili kimliğini çizer", () => {
    render(<SummaryTab data={data()} />);
    expect(screen.getByText("GmbH (Diğer)")).toBeInTheDocument();
    expect(screen.getByText("80331")).toBeInTheDocument();
    expect(screen.getByText("C01***89")).toBeInTheDocument();
  });

  // 2026-10-08: yerel ad HER türde saklanır (kayıt sihirbazı ülkenin yerel
  // yapılarını listeler) — eskiden yalnız "Diğer"de basılıyordu.
  it.each([
    [{ companyType: "LIMITED", legalFormLocal: "GmbH" }, "GmbH (Limited Şirket)"],
    [{ companyType: "JOINT_STOCK", legalFormLocal: "ПАО" }, "ПАО (Anonim Şirket)"],
    [{ companyType: "SOLE_PROPRIETOR", legalFormLocal: "Sole trader" }, "Sole trader (Şahıs Firması)"],
    [{ companyType: "LIMITED", legalFormLocal: null }, "Limited Şirket"],
    [{ companyType: "LIMITED", legalFormLocal: "  " }, "Limited Şirket"],
    [{ companyType: null, legalFormLocal: "GmbH" }, "GmbH"],
  ])("hukuki yapı satırı: %j → %s", (over, text) => {
    render(<SummaryTab data={data(over)} />);
    expect(screen.getByText("Hukuki yapı").nextElementSibling?.textContent).toBe(text);
  });

  it("AB firmasında VIES kaydı yoksa 'Sorgulanmadı'; kayıt varsa sonuç + VIES'teki ad", () => {
    const { unmount } = render(<SummaryTab data={data()} />);
    expect(screen.getByText("Sorgulanmadı")).toBeInTheDocument();
    unmount();
    render(
      <SummaryTab
        data={data({
          vies: {
            valid: true,
            unavailable: false,
            name: "MUSTER GMBH",
            address: null,
            vatNumber: "811569869",
            countryCode: "DE",
            source: "onboarding",
            checkedAt: "2026-09-27T10:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText(/^Geçerli · DE811569869 · .* · VIES'teki ad: MUSTER GMBH$/)).toBeInTheDocument();
  });

  it("servis yanıt vermediyse 'Servis yanıt vermedi' (geçersiz DEĞİL)", () => {
    render(
      <SummaryTab
        data={data({
          vies: {
            valid: false,
            unavailable: true,
            name: null,
            address: null,
            vatNumber: "811569869",
            countryCode: "DE",
            source: "manual",
            checkedAt: "2026-09-27T10:00:00.000Z",
          },
        })}
      />,
    );
    expect(screen.getByText(/^Servis yanıt vermedi/)).toBeInTheDocument();
    expect(screen.queryByText(/^Geçersiz/)).not.toBeInTheDocument();
  });

  it("AB dışı ve kayıtsız firmada VIES satırı yok", () => {
    // Türk Limited şirketi: yerel ad yok (genel listeden seçildi) → türün adı.
    render(
      <SummaryTab data={data({ country: "TR", viesSupported: false, companyType: "LIMITED", legalFormLocal: null })} />,
    );
    expect(screen.queryByText("VIES (AB KDV)")).not.toBeInTheDocument();
    expect(screen.getByText("Limited Şirket")).toBeInTheDocument();
  });

  it("kodlu red gerekçesi okunur Türkçe metinle basılır", () => {
    render(<SummaryTab data={data({ companyRejectionReason: "[COUNTRY_CHANGED]" })} />);
    expect(
      screen.getByText("Red gerekçesi: Ülke değişti — yeni zorunlu belgeler eksik"),
    ).toBeInTheDocument();
  });
});
