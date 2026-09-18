// @vitest-environment jsdom
/**
 * ÜRÜN ÖNİZLEME (inceleme kilidi) — sözleşme: form kontrolü YOK, kilit bandı
 * var, nitelikler kategori tanımından ETİKETLİ, yalnız yayındaki üründe
 * "Vitrinden çek".
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: { name: "Acme", slug: "acme", tier: "SILVER", companyVerificationStatus: "VERIFIED" } }),
}));
vi.mock("@/hooks/use-company-profile", () => ({
  useCompanyProfile: () => ({ data: { name: "Acme Elektrik", city: "İzmir", country: "TR", logoUrl: null, industry: null, foundedYear: null, employeeCount: null, certifications: [] } }),
}));
vi.mock("@/hooks/use-categories", () => ({
  useCategoriesByIds: () => ({ data: [{ id: "39121600", code: "39121600", nameTr: "Dağıtım panoları", level: 3, breadcrumb: "" }] }),
}));
vi.mock("@/hooks/use-company-items", () => ({
  usePublishProduct: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { ProductPreview } from "../product-preview";
import { ShowcasePanel } from "../showcase-panel";

const base = {
  id: "p3",
  name: "Sigorta kutusu",
  slug: "sigorta-kutusu",
  isPublic: false,
  publishedAt: null,
  reviewStatus: "PENDING" as const,
  submittedAt: "2026-09-10T08:00:00.000Z",
  reviewedAt: null,
  rejectReason: null,
  categoryId: "39121600",
  description: "IP65 sigorta kutusu, 12 modül, DIN ray montajlı.",
  images: ["https://cdn.rothern.com/a.webp"],
  videoUrl: null,
  externalUrl: null,
  documents: null,
  keywords: ["sigorta"],
  attributes: { ip: "IP65", uydurma: "x" },
  priceMode: "ON_REQUEST" as const,
  priceAmount: null,
  priceTiers: null,
  priceCurrency: "TRY",
  moq: null,
  unit: "adet",
  unitCode: "PCE",
  completion: { score: 80, missing: [] },
  publishBlockers: [],
  attributeDefs: [{ key: "ip", nameTr: "Koruma sınıfı", type: "SINGLE_SELECT" as const, options: ["IP65"], unit: null, isRequired: false, definedAt: "39000000" }],
};
const item = { brand: null, mpn: null, specification: null };

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

describe("ProductPreview", () => {
  it("kilit bandı + alıcı gövdesi; form kontrolü yok; nitelik etiketli; tanımsız anahtar çizilmez", async () => {
    const u = userEvent.setup();
    wrap(<ProductPreview product={base} item={item} onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("İncelemede — önizleme");
    expect(screen.getByRole("status")).toHaveTextContent("Onay bekliyor");
    expect(screen.getByRole("heading", { level: 1, name: "Sigorta kutusu" })).toBeInTheDocument();
    await u.click(screen.getByRole("tab", { name: "Teknik Özellikler" }));
    expect(screen.getByText("Koruma sınıfı")).toBeInTheDocument();
    expect(screen.getByText("IP65")).toBeInTheDocument();
    expect(screen.queryByText("uydurma")).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.queryByRole("button", { name: /Kaydet|Onaya gönder/ })).toBeNull();
    expect(screen.queryByRole("button", { name: "Vitrinden çek" })).toBeNull();
  });

  it("yayındaki ürünün yeniden incelemesinde 'Vitrinden çek' var (içerik değişikliği değil)", () => {
    wrap(<ProductPreview product={{ ...base, isPublic: true, publishedAt: "2026-09-01T00:00:00.000Z" }} item={item} onClose={() => {}} />);
    expect(screen.getByRole("status")).toHaveTextContent("Yayında · incelemede");
    expect(screen.getByRole("button", { name: "Vitrinden çek" })).toBeInTheDocument();
  });
});

/**
 * VİTRİN PANELİ (2026-09-18): düzenleyicinin sağında; Kart | Sayfa anahtarı,
 * onay için gerekli eksikler tıklanınca ilgili bölüme atlar, form kontrolü yok.
 */
describe("ShowcasePanel", () => {
  it("Kart varsayılan, Sayfa'ya geçince herkese açık gövde çizilir; eksik çipi bölüme atlar", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    wrap(
      <ShowcasePanel
        product={{ ...base, reviewStatus: "DRAFT", images: [] }}
        item={item}
        completion={{ score: 60, missing: [{ key: "images", label: "Görsel", points: 20 }] }}
        blockers={["En az 1 görsel eklenmeli"]}
        onJump={onJump}
      />,
    );
    const panel = screen.getByRole("region", { name: "Vitrin önizlemesi" });
    expect(screen.getByRole("tab", { name: "Kart" })).toHaveAttribute("aria-selected", "true");
    expect(panel).toHaveTextContent("Sigorta kutusu");
    expect(panel).toHaveTextContent("Ürünler dizininde ve firma profilinizde böyle görünür.");
    await user.click(screen.getByRole("tab", { name: "Sayfa" }));
    expect(panel).toHaveTextContent("Koruma sınıfı"); // nitelik etiketi herkese açık gövdeden
    expect(panel).toHaveTextContent("Alıcı burada “Bilgi iste” düğmesini görür");
    await user.click(screen.getByRole("button", { name: "En az 1 görsel eklenmeli" }));
    expect(onJump).toHaveBeenCalledWith("urun-gorsel");
    expect(screen.getByText("%60")).toBeInTheDocument();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});
