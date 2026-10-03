// @vitest-environment jsdom
/**
 * Talep detayı — teklif veren görünümü (arayüz testi webB-06):
 *  · O-037/D-278: kalem hücresinde marka · parça no, "Muadil kabul edilmez",
 *    istenen teslim tarihi; sorular dokunarak açılan panelde.
 *  · D-176: kapanışsız açık talepte başlık kartında "Teklif Ver".
 *  · D-195: tamamlanmış talepte rol uyarısı yok.
 *  · D-278: alıcının iç "Kazandırma Onayı" durumu teklif verene "Değerlendirmede".
 *  · D-024: 404'te satınalma izni olmayan üyeye kendi-firma notu, "Tekrar dene" yok.
 */
import type { ListingDetail } from "@/hooks/use-company-listings";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  detail: undefined as unknown,
  error: null as unknown,
  perms: [] as string[],
}));

vi.mock("next/navigation", () => ({
  useParams: () => ({ id: "l1" }),
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/ilan/l1",
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn(), warning: vi.fn(), info: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: vi.fn(async () => ({ data: [] })),
    post: vi.fn(async () => ({ data: {} })),
    patch: vi.fn(async () => ({ data: {} })),
    delete: vi.fn(async () => ({ data: {} })),
  },
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { id: "u2" },
    company: { id: "c2", country: "TR", tier: "SILVER", companyVerificationStatus: "VERIFIED" },
  }),
  useHasCompanyPermission: (p: string) => h.perms.includes(p),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) =>
    sel({ user: { id: "u2", permissions: h.perms }, company: { id: "c2", country: "TR" } }),
}));
vi.mock("@/hooks/use-company-approvals", () => ({
  useCancelApproval: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", async (importOriginal) => {
  const mod = await importOriginal<Record<string, unknown>>();
  return {
    ...mod,
    useListingDetail: () => ({
      data: h.error ? undefined : h.detail,
      isLoading: false,
      isFetching: false,
      isError: !!h.error,
      error: h.error,
      refetch: vi.fn(),
    }),
  };
});

import ListingDetailPage from "../page";

function detail(over: Partial<ListingDetail> = {}): ListingDetail {
  return {
    id: "l1",
    number: "ROT-2026-0002",
    type: "ALIM",
    title: "Vana Alımı",
    status: "OPEN",
    format: "RFQ",
    isOwner: false,
    canBid: true,
    roleAllowsBid: true,
    invited: true,
    primaryCurrency: "TRY",
    allowedCurrencies: [],
    categoryIds: [],
    targetCountries: [],
    closesAt: new Date(Date.now() + 3 * 86_400_000).toISOString(),
    owner: { id: "c1", name: "Alıcı AŞ" },
    items: [
      {
        id: "i1",
        lineNo: 1,
        name: "Küresel Vana",
        description: null,
        quantity: "10",
        unit: "adet",
        targetPrice: null,
        brand: "Valfsan",
        mpn: "KV-50",
        alternativeAllowed: false,
        requiredByDate: "2026-11-20T00:00:00.000Z",
        questions: [
          { id: "q1", text: "Sertifika var mı?", answerType: "YES_NO", required: true },
          { id: "q2", text: "Menşei nedir?", answerType: "TEXT", required: false },
        ],
      },
    ],
    myBid: null,
    ...over,
  } as unknown as ListingDetail;
}

function renderPage() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <ListingDetailPage />
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  h.detail = detail();
  h.error = null;
  h.perms = ["sell:view", "sell:bid:submit"];
});

describe("teklif veren talep detayı — kalem bilgileri (O-037 / D-278)", () => {
  it("marka · parça no, muadil kapalı rozeti ve istenen teslim tarihi görünür", () => {
    renderPage();
    expect(screen.getByText("Marka / Parça no: Valfsan · KV-50")).toBeInTheDocument();
    expect(screen.getByText("Muadil kabul edilmez")).toBeInTheDocument();
    expect(screen.getByText(/^İstenen teslim: 20 Kas 2026/)).toBeInTheDocument();
  });

  it("sorular title ipucunda değil, dokunarak açılan panelde", () => {
    renderPage();
    const summary = screen.getByText("2 soru").closest("summary")!;
    expect(summary).toBeInTheDocument();
    const details = summary.closest("details")!;
    expect(within(details).getByText("Sertifika var mı?")).toBeInTheDocument();
    expect(within(details).getByText("Menşei nedir?")).toBeInTheDocument();
    expect(within(details).getByText("(zorunlu)")).toBeInTheDocument();
    expect(details.querySelector("[title]")).toBeNull();
  });
});

describe("teklif veren başlık kartı", () => {
  it("kapanışı olmayan açık talepte de 'Teklif Ver' başlık kartında (D-176)", () => {
    h.detail = detail({ closesAt: null } as Partial<ListingDetail>);
    renderPage();
    // Yapışkan çubuk (başlık görünürken gizli) + başlık kartı = iki CTA.
    expect(screen.getAllByRole("link", { name: /Teklif Ver/ })).toHaveLength(2);
  });

  it("alıcının 'Kazandırma Onayı' durumu teklif verene 'Değerlendirmede' görünür (D-278)", () => {
    h.detail = detail({ status: "IN_AWARD_APPROVAL" });
    renderPage();
    expect(screen.queryByText("Kazandırma Onayı")).toBeNull();
    expect(screen.getAllByText("Değerlendirmede").length).toBeGreaterThan(0);
  });

  it("yapışkan çubukta kapanış tarihi metne girer — çıplak 'Kapanış' değil (yeniden doğrulama)", () => {
    h.detail = detail({ closesAt: "2026-11-04T09:30:00.000Z" } as Partial<ListingDetail>);
    renderPage();
    expect(screen.getByText(/^Kapanış: .*2026/)).toBeInTheDocument();
  });

  it("değerlendirmedeki talepte 'Teklif alımı kapandı' hapı ızgarada gerilmez (yeniden doğrulama)", () => {
    h.detail = detail({ status: "IN_AWARD" });
    renderPage();
    const pill = screen.getByText(/Teklif alımı kapandı/);
    expect(pill.className).toContain("self-start");
    expect(pill.className).toContain("justify-self-start");
  });

  it("tamamlanmış talepte teklif rolü uyarısı gösterilmez (D-195)", () => {
    h.perms = ["sell:view"];
    h.detail = detail({
      status: "AWARDED",
      roleAllowsBid: false,
      myBid: { amount: "1000", status: "WON", version: 1, note: null },
    } as Partial<ListingDetail>);
    renderPage();
    expect(screen.queryByText(/Teklif verme/)).toBeNull();
  });

  it("açık talepte rol uyarısı yine görünür — rol etiketi değil eksik izni söyler (arayüz testi T3)", () => {
    h.perms = ["sell:view"];
    h.detail = detail({ roleAllowsBid: false });
    renderPage();
    expect(screen.getByText("Teklif verme")).toBeInTheDocument();
    expect(screen.getByText(/yetkisi gerekir/)).toBeInTheDocument();
    expect(screen.queryByText(/Satışçı/)).toBeNull();
  });
});

describe("kapalı zarf bandı (canlı öncesi)", () => {
  it("teklif verene kapanıştan sonra açılma vaadi vermez — teklifi yalnız alıcının gördüğünü söyler", () => {
    renderPage();
    expect(screen.getByText("Kapalı zarf: diğer tekliflerin tutarını göremezsiniz.")).toBeInTheDocument();
    expect(
      screen.getByText("Teklifinizi diğer tedarikçiler hiçbir zaman göremez; yalnız alıcı firma görür."),
    ).toBeInTheDocument();
    expect(screen.queryByText(/kapanış tarihinden sonra/)).toBeNull();
  });
});

describe("talebe ulaşılamıyor (D-024)", () => {
  it("404'te 'Tekrar dene' yok; satınalma izni olmayan üyeye kendi-firma notu", () => {
    h.error = { response: { status: 404 } };
    renderPage();
    expect(screen.getByText("Talebe ulaşılamıyor.")).toBeInTheDocument();
    expect(screen.getByText(/kendi firmanıza aitse/)).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "Tekrar dene" })).toBeNull();
  });

  it("satınalma izni olan üyeye kendi-firma notu gösterilmez", () => {
    h.error = { response: { status: 404 } };
    h.perms = ["buy:view", "sell:view"];
    renderPage();
    expect(screen.queryByText(/kendi firmanıza aitse/)).toBeNull();
  });
});
