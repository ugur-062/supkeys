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
import { EditorRail } from "../editor-rail";

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
 * YAYINDAKİ ÜRÜN ÖNİZLEMESİ (2026-09-19): açılışta alıcının gördüğü hâl +
 * "Düzenle" (forma geçirir) + herkese açık sayfa bağlantısı + Vitrinden çek;
 * amber inceleme bandı YOK.
 */
describe("ProductPreview published", () => {
  it("Düzenle onEdit'i çağırır; herkese açık bağlantı firma/ürün slug'ından; inceleme bandı yok", async () => {
    const user = userEvent.setup();
    const onEdit = vi.fn();
    wrap(
      <ProductPreview
        variant="published"
        product={{ ...base, reviewStatus: "APPROVED", isPublic: true, publishedAt: "2026-09-01T00:00:00.000Z" }}
        item={item}
        onClose={() => {}}
        onEdit={onEdit}
      />,
    );
    expect(screen.getByRole("status")).toHaveTextContent("Alıcının gördüğü hâl");
    expect(screen.queryByText(/İncelemede — önizleme/)).toBeNull();
    expect(screen.getByRole("link", { name: /Herkese açık sayfayı aç/ })).toHaveAttribute("href", "/firma/acme/urun/sigorta-kutusu");
    expect(screen.getByRole("button", { name: "Vitrinden çek" })).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: /Düzenle/ }));
    expect(onEdit).toHaveBeenCalled();
    expect(screen.queryByRole("textbox")).toBeNull();
  });
});

/**
 * DÜZENLEYİCİ RAYI (2026-09-19): tamamlanma + onay için eksik çipleri
 * (tıklayınca bölüme atlar) + katlanabilir öneriler; önizleme yok.
 */
describe("EditorRail", () => {
  it("eksik çipi bölüme atlar, yüzde ve öneriler çizilir", async () => {
    const user = userEvent.setup();
    const onJump = vi.fn();
    wrap(
      <EditorRail
        completion={{ score: 60, missing: [{ key: "images", label: "Görsel", points: 20 }] }}
        blockers={["En az 1 görsel eklenmeli"]}
        onJump={onJump}
        recommendations={<p>öneri-kartı</p>}
      />,
    );
    expect(screen.getByText("%60")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "En az 1 görsel eklenmeli" }));
    expect(onJump).toHaveBeenCalledWith("urun-gorsel");
    expect(screen.getByText("öneri-kartı")).toBeInTheDocument();
    expect(screen.queryByText("Alıcının gördüğü hâl")).toBeNull();
  });
});
