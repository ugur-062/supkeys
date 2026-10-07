// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render as rtlRender, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  get: vi.fn<(url: string) => Promise<{ data: unknown }>>(),
  replace: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: h.replace }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satis/acik-talep/ROT-000042",
}));
vi.mock("@/lib/company-auth/api", () => ({ companyApi: { get: h.get } }));

import { MaskedRequestView } from "../masked-request-view";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

const render = (ui: React.ReactElement) =>
  rtlRender(
    <QueryClientProvider client={new QueryClient({ defaultOptions: { queries: { retry: false } } })}>
      {ui}
    </QueryClientProvider>,
  );

/** Herkese açık detay gövdesi (`toPublicListingDetail`) + masked bayrağı. */
const DETAIL = {
  masked: true,
  number: "ROT-000042",
  slug: "rot-000042-celik-boru",
  type: "ALIM",
  title: "Dikişsiz çelik boru alımı",
  description: "40 ton dikişsiz boru, teslim İstanbul deposu.",
  status: "OPEN",
  format: "RFQ",
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY"],
  isInternational: false,
  targetCountries: [],
  categoryIds: ["31000000"],
  preferredActivities: [],
  keywords: [],
  requireAllItems: false,
  requireBidDocument: false,
  requireGuaranteeLetter: false,
  isSealedBid: true,
  isLogistics: false,
  deliveryTerm: null,
  paymentCategory: "CASH",
  paymentTiming: "AFTER_DELIVERY",
  advancePercent: null,
  paymentDays: null,
  lcType: null,
  lcConfirmed: false,
  closesAt: new Date(Date.now() + 6 * 86_400_000).toISOString(),
  publishedAt: new Date().toISOString(),
  updatedAt: new Date().toISOString(),
  coverImageUrl: null,
  indexable: true,
  itemCount: 1,
  itemSummary: { count: 1, totalQuantity: "40", unit: "ton" },
  items: [{ lineNo: 1, name: "Dikişsiz boru 3 inç", quantity: "40", unit: "ton" }],
  company: { city: "İstanbul", country: "TR", industry: "Metal", activities: [], verified: true },
  categories: [{ id: "31000000", name: "Üretim Bileşenleri", level: 1 }],
};

function setCompany(tier: string, companyVerificationStatus = "VERIFIED") {
  useCompanyAuthStore.setState({ company: { tier, companyVerificationStatus } as never });
}

beforeEach(() => {
  vi.clearAllMocks();
  // Ücretsiz dönem: maskeli görünüme yalnız DOĞRULANMAMIŞ firma düşer.
  setCompany("STANDART", "UNVERIFIED");
});

describe("MaskedRequestView (doğrulanmamış firmanın alıcı gizli talep görünümü, 2026-10-03)", () => {
  it("herkese açık detayı numarayla ister; alıcı gizli, kalemler ve kapalı zarf notu görünür", async () => {
    h.get.mockResolvedValue({ data: DETAIL });
    render(<MaskedRequestView number="ROT-000042" />);
    expect(await screen.findByRole("heading", { level: 1, name: "Dikişsiz çelik boru alımı" })).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("/company/listings/seller-tenders/masked/ROT-000042");
    expect(screen.getAllByText("Alıcı gizli").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("Doğrulanmış alıcı")).toBeInTheDocument();
    // Alıcının ŞEHRİ değil talebin açıldığı ÜLKE (2026-10-04): "İstanbul" yerine
    // bayrak + "Türkiye" (açıklamadaki serbest metin hariç).
    expect(screen.getByText("Türkiye")).toBeInTheDocument();
    expect(screen.queryByText("İstanbul")).toBeNull();
    expect(document.querySelector('img[src="/flags/4x3/tr.svg"]')).not.toBeNull();
    expect(screen.getByText("Dikişsiz boru 3 inç")).toBeInTheDocument();
    expect(screen.getByText(/Kapalı zarf: teklifleri yalnız talep sahibi görür/)).toBeInTheDocument();
    expect(screen.getAllByText("ROT-000042").length).toBeGreaterThanOrEqual(1);
    // Tek eylem doğrulama akışı; paket adı/sayfası yok (ücretsiz dönem 2026-10-07).
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(screen.getByText(/alıcının adını görmek için firma doğrulaması gerekir/)).toBeInTheDocument();
    expect(document.body.textContent).not.toMatch(/Silver|Gold|Platinum|paket/i);
    // Tam detaya ya da belge/mesaj eylemine bağlantı yok.
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((x) => x.startsWith("/company/ilan/"))).toBe(false);
    expect(hrefs.some((x) => x.includes("mesaj"))).toBe(false);
    expect(hrefs.some((x) => x.includes("/company/premium"))).toBe(false);
  });

  it("CTA doğrulama durumunu izler: incelemede → durum bağlantısı, reddedilmiş → yeniden başvuru; hep doğrulama sayfası", async () => {
    setCompany("STANDART", "PENDING");
    h.get.mockResolvedValue({ data: DETAIL });
    const first = render(<MaskedRequestView number="ROT-000042" />);
    expect(await screen.findByRole("link", { name: "Doğrulama durumunu gör" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(screen.queryByRole("link", { name: "Firmanızı doğrulayın" })).toBeNull();
    first.unmount();

    setCompany("STANDART", "REJECTED");
    render(<MaskedRequestView number="ROT-000042" />);
    expect(await screen.findByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    const hrefs = screen.getAllByRole("link").map((a) => a.getAttribute("href") ?? "");
    expect(hrefs.some((x) => x.includes("/company/premium"))).toBe(false);
  });

  it("talep maskesiz görülebiliyorsa (davet/bağlantı/doğrulanmış firma) tam detaya yönlendirir", async () => {
    h.get.mockResolvedValue({ data: { masked: false, id: "cl_123" } });
    render(<MaskedRequestView number="ROT-000042" />);
    await waitFor(() => expect(h.replace).toHaveBeenCalledWith("/company/ilan/cl_123"));
  });

  it("404: 'Talep bulunamadı' + Açık Talepler'e dönüş", async () => {
    h.get.mockRejectedValue({ response: { status: 404 } });
    render(<MaskedRequestView number="ROT-999999" />);
    expect(await screen.findByText("Talep bulunamadı")).toBeInTheDocument();
    expect(screen.getAllByRole("link", { name: "Açık Talepler" })[0]).toHaveAttribute("href", "/company/satis#acik-talepler");
  });

  it("kapanmış talepte teklif çağrısı yok", async () => {
    h.get.mockResolvedValue({ data: { ...DETAIL, status: "AWARDED" } });
    render(<MaskedRequestView number="ROT-000042" />);
    expect(await screen.findByText("Bu talep teklife kapalı.")).toBeInTheDocument();
    expect(screen.queryByRole("link", { name: "Firmanızı doğrulayın" })).toBeNull();
    expect(document.querySelector('a[href="/company/ayarlar/dogrulama"]')).toBeNull();
  });
});
