// @vitest-environment jsdom
/**
 * HIZLI TALEP — sözleşme: satır ayrıştırma kalemleri doldurur ve başlığı
 * türetir; şartlar profilden forma iner; yayın sihirbazla AYNI gövdeyi
 * (`mapToInput`) üretir; profil yoksa kurulum kartı çıkar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  defaults: { data: undefined as unknown, isLoading: false },
  create: vi.fn(),
  saveDefaults: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: () => true,
  useCompanyAuth: () => ({ user: null, company: { tier: "GOLD", companyVerificationStatus: "VERIFIED", name: "Acme", slug: "acme" } }),
}));
vi.mock("@/hooks/use-request-defaults", () => ({
  useRequestDefaults: () => h.defaults,
  useSaveRequestDefaults: () => ({ mutateAsync: h.saveDefaults, isPending: false }),
}));
vi.mock("@/hooks/use-company-addresses", () => ({
  useAddresses: () => ({ data: [{ id: "addr1", type: "TESLIMAT", title: "Depo", city: "İzmir", isDefault: true }], isLoading: false }),
  useSaveAddress: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-connections", () => ({ useConnections: () => ({ data: [], isLoading: false }) }));
vi.mock("@/hooks/use-company-listings", () => ({ useCreateListing: () => ({ mutateAsync: h.create, isPending: false }) }));
vi.mock("@/hooks/use-ai-search-intent", () => ({ useAiSearchIntent: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/components/tenders/supplier-discovery-modal", () => ({ SupplierDiscoveryModal: () => null }));
vi.mock("@/components/tenders/wizard/catalog-picker-dialog", () => ({ CatalogPickerDialog: () => null }));
vi.mock("@/components/tenders/wizard/staged-documents", () => ({ StagedDocuments: () => <div data-testid="staged-docs" /> }));
vi.mock("@/hooks/use-listing-documents", () => ({ uploadListingDocument: vi.fn() }));
vi.mock("@/hooks/use-company-tenders", () => ({ useTenders: () => ({ data: [{ id: "t9", title: "Geçen ayki kablo alımı", status: "AWARDED" }] }) }));
vi.mock("@/hooks/use-company-directory", () => ({ useCompanySearch: () => ({ data: { items: [], total: 12 } }) }));
vi.mock("@/hooks/use-ai-seo-enrich", () => ({ useAiSeoEnrich: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/use-company-items", () => ({ useCatalogItems: () => ({ data: { items: [] } }) }));
vi.mock("@/components/tenders/ai-import/ai-import-dialog", () => ({ AiImportDialog: () => null }));
vi.mock("@/hooks/use-categories", () => ({
  useCategoriesByIds: () => ({ data: [{ id: "39121600", nameTr: "Dağıtım panoları" }] }),
  useCategorySearchTree: () => ({ data: { segments: [{ id: "40000000", code: "40000000", nameTr: "Boru", level: 1, segmentLetter: null, families: [{ id: "40170000", code: "40170000", nameTr: "Borular", level: 2, classes: [{ id: "40171500", code: "40171500", nameTr: "Çelik borular", level: 3, isMatch: true, commodities: [] }] }] }] } }),
}));
vi.mock("@/components/categories/category-selector-button", () => ({
  CategorySelectorButton: ({ value, onChange }: { value: string[]; onChange: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onChange(["39121600"])}>{value.length ? `Kategori: ${value[0]}` : "Kategori seç"}</button>
  ),
}));

import { QuickRequest } from "../quick-request";

const SAVED = {
  isInternational: false,
  visibility: "CONNECTIONS",
  deliveryTerm: "DOMESTIC_DELIVERED",
  paymentCategory: "DEFERRED",
  paymentDays: 45,
  advancePercent: null,
  lcType: null,
  primaryCurrency: "TRY",
  allowedCurrencies: ["TRY", "EUR"],
  isSealedBid: true,
  bidVisibility: "OWN_RANK",
  requireAllItems: false,
  requireBidDocument: false,
  closeDays: 7,
  deliveryAddressId: "addr1",
  billingSameAsDelivery: true,
};

function wrap(ui: React.ReactElement) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
  return render(<QueryClientProvider client={qc}>{ui}</QueryClientProvider>);
}

beforeEach(() => {
  h.create.mockReset();
  h.saveDefaults.mockReset();
  sessionStorage.clear();
  h.defaults = { data: { defaults: SAVED, source: "saved" }, isLoading: false };
});

describe("QuickRequest", () => {
  it("'Ne lazım?' satırları kaleme çevirir, başlık türetir, şartlar profilden gelir; yayın sihirbaz gövdesini üretir", async () => {
    h.create.mockResolvedValue({ id: "l1", number: "ROT-000042" });
    wrap(<QuickRequest />);
    const need = await screen.findByRole("textbox", { name: "Ne lazım?" });
    fireEvent.change(need, { target: { value: "1200 m çelik boru\nvida M8 x 500 adet" } });
    fireEvent.click(screen.getByRole("button", { name: "AI'sız ekle" }));

    expect(await screen.findByLabelText("Kalem 1 adı")).toHaveValue("çelik boru");
    expect(screen.getByLabelText("Kalem 1 miktarı")).toHaveValue(1200);
    expect(screen.getByLabelText("Kalem 2 adı")).toHaveValue("vida M8");
    expect(screen.getByDisplayValue("Çelik boru, vida M8 alımı")).toBeInTheDocument();
    // Şartlar paneli profilden
    expect(screen.getByText("Kaynak: talep şartlarınız")).toBeInTheDocument();
    expect(screen.getAllByText(/Vadeli/).length).toBeGreaterThan(0);
    // Kapsam: bağlantılarım seçili; özet dolu
    expect(screen.getByRole("button", { name: /^Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 kalem · Dağıtım panoları")).toBeInTheDocument();
    // Kime: bağlantı sayısı gerçek veriden; herkese açıkta dizin sayısı
    expect(screen.getByText(/0 bağlantınız görecek/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Herkese açık/ }));
    expect(screen.getByText(/12 firma/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: /^Bağlantılarım/ }));

    // AI'sız kategori önerisi: kalem adından arama → çip → tek tıkla seçim
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    expect(screen.getByText("Kategori: 40171500")).toBeInTheDocument();
    // Modal seçimi öneriyi ezmez, ekler (en fazla 3)
    fireEvent.click(screen.getByRole("button", { name: /Kategori: 40171500/ }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    const body = h.create.mock.calls[0][0];
    expect(body).toMatchObject({
      type: "ALIM",
      title: "Çelik boru, vida M8 alımı",
      visibility: "CONNECTIONS",
      deliveryTerm: "DOMESTIC_DELIVERED",
      paymentCategory: "DEFERRED",
      paymentDays: 45,
      primaryCurrency: "TRY",
      allowedCurrencies: ["TRY", "EUR"],
      deliveryAddressId: "addr1",
      billingAddressId: "addr1",
      categoryIds: ["39121600"],
      isSealedBid: true,
    });
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ name: "çelik boru", quantity: 1200, unitCode: "M" });
    expect(body.asDraft).toBeUndefined();
    expect(await screen.findByText("Talebiniz yayında")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talebi gör" })).toHaveAttribute("href", "/company/ilan/l1");
  });

  it("boş kartta 'son taleplerden başla' çipi görünür", async () => {
    wrap(<QuickRequest />);
    expect(await screen.findByRole("button", { name: "Geçen ayki kablo alımı" })).toBeInTheDocument();
  });

  it("profil yoksa kurulum kartı; kaydedince profile yazılır", async () => {
    h.defaults = { data: { defaults: null, source: "none" }, isLoading: false };
    h.saveDefaults.mockResolvedValue({ defaults: SAVED, source: "saved" });
    wrap(<QuickRequest />);
    const card = (await screen.findByText("İlk talebiniz — üç kısa soru")).closest("div") as HTMLElement;
    expect(card).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Kaydet ve devam et" });
    expect(btn).toBeDisabled(); // teslim şekli seçilmeden devam yok
    const select = within(card.parentElement as HTMLElement).getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "DOMESTIC_PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet ve devam et" }));
    await waitFor(() => expect(h.saveDefaults).toHaveBeenCalledTimes(1));
    expect(h.saveDefaults.mock.calls[0][0]).toMatchObject({ deliveryTerm: "DOMESTIC_PICKUP", isInternational: false });
    expect(screen.queryByText("İlk talebiniz — üç kısa soru")).toBeNull();
  });
});
