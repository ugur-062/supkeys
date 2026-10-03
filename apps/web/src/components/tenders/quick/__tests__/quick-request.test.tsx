// @vitest-environment jsdom
/**
 * HIZLI TALEP — sözleşme: kalemler sihirbazın satır bileşeniyle (Step2Items)
 * girilir; başlık boşsa yayında kalemlerden türetilir; şartlar profilden
 * forma iner; yayın sihirbazla AYNI gövdeyi (`mapToInput`) üretir; profil
 * yoksa kurulum kartı çıkar.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  defaults: { data: undefined as unknown, isLoading: false },
  create: vi.fn(),
  saveDefaults: vi.fn(),
  push: vi.fn(),
  connections: [] as unknown[],
  sendExternal: vi.fn(),
  externalSearch: vi.fn().mockResolvedValue([]),
  platformSearch: vi.fn().mockResolvedValue([]),
  inviteMembers: vi.fn(),
  update: vi.fn(),
  publish: vi.fn(),
  addresses: undefined as unknown,
  upload: vi.fn(),
  denied: [] as string[],
  existingDocs: [] as unknown[],
  verification: "VERIFIED",
}));

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: h.push, replace: vi.fn() }), useSearchParams: () => new URLSearchParams() }));
vi.mock("@/hooks/use-company-auth", () => ({
  useHasCompanyPermission: (p: string) => !h.denied.includes(p),
  useCompanyAuth: () => ({ user: null, company: { tier: "GOLD", companyVerificationStatus: h.verification, name: "Acme", slug: "acme" } }),
}));
vi.mock("@/hooks/use-request-defaults", () => ({
  useRequestDefaults: () => h.defaults,
  useSaveRequestDefaults: () => ({ mutateAsync: h.saveDefaults, isPending: false }),
}));
vi.mock("@/hooks/use-company-addresses", () => ({
  useAddresses: () => ({ data: h.addresses, isLoading: false }),
  useSaveAddress: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({ data: h.connections, isLoading: false }),
  useInviteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useCreateListing: () => ({ mutateAsync: h.create, isPending: false }),
  // Düzenleme modu (2026-09-19, sihirbaz kaldırıldı) — derin denetim Y-19/Y-20 testleri.
  useUpdateListing: () => ({ mutateAsync: h.update, isPending: false }),
  usePublishListing: () => ({ mutateAsync: h.publish, isPending: false }),
  // Yayın paneli paylaş düğmesi için talep detayını okur (vitrindeyse).
  useListingDetail: () => ({ data: undefined }),
}));
// Tedarikçi grupları (T-19) — seçicinin "Gruptan ekle" listesi; bu dosyada grup yok.
vi.mock("@/hooks/use-supplier-templates", () => ({
  useSupplierTemplates: () => ({ data: [] }),
  fetchSupplierTemplate: vi.fn(),
}));
vi.mock("@/hooks/use-listing-templates", () => ({ useSaveTemplate: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/hooks/use-ai-search-intent", () => ({ useAiSearchIntent: () => ({ mutateAsync: vi.fn(), isPending: false }) }));
vi.mock("@/components/tenders/supplier-discovery-modal", () => ({ SupplierDiscoveryModal: () => null }));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useExternalTenderInvite: () => ({ mutateAsync: h.sendExternal, isPending: false }),
  useInviteDiscoveredMembers: () => ({ mutateAsync: h.inviteMembers, isPending: false }),
  useExternalSupplierDiscovery: () => ({ mutateAsync: h.externalSearch, isPending: false }),
  useSupplierDiscovery: () => ({ mutateAsync: h.platformSearch, isPending: false }),
  useListingDiscovery: () => ({ data: undefined }),
  useInviteDiscoveryCandidates: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useDismissListingDiscovery: () => ({ mutate: vi.fn(), isPending: false }),
}));
vi.mock("@/components/tenders/wizard/catalog-picker-dialog", () => ({ CatalogPickerDialog: () => null }));
vi.mock("@/components/tenders/wizard/staged-documents", () => ({
  StagedDocuments: ({ onChange }: { onChange: (docs: { file: File; kind: string }[]) => void }) => (
    <div data-testid="staged-docs">
      <button type="button" onClick={() => onChange([{ file: new File(["x"], "sartname.pdf", { type: "application/pdf" }), kind: "SPECIFICATION" }])}>
        Test belgesi ekle
      </button>
    </div>
  ),
}));
vi.mock("@/hooks/use-listing-documents", () => ({
  uploadListingDocument: h.upload,
  useListingDocuments: (_id: string, enabled: boolean) => ({ data: enabled ? h.existingDocs : undefined }),
}));
// Düzenlemede 4. bölüm mevcut belgeleri FilesTab ile yönetir (O-087).
vi.mock("@/components/tenders/files-tab", () => ({
  FilesTab: ({ listingId, canEdit }: { listingId: string; canEdit?: boolean }) => <div data-testid="files-tab" data-listing={listingId} data-can-edit={String(!!canEdit)} />,
}));
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
  CategorySelectorButton: ({ value, onChange, modalDescription }: { value: string[]; onChange: (ids: string[]) => void; modalDescription?: string }) => (
    <button type="button" data-description={modalDescription} onClick={() => onChange(["39121600"])}>{value.length ? `Kategori: ${value[0]}` : "Kategori seç"}</button>
  ),
}));

import { toast } from "sonner";
import { QuickRequest } from "../quick-request";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { closesAtFromDays } from "@/lib/tenders/request-defaults";
import { parseAppWallClockInput } from "@/lib/time-zone";

const SAVED = {
  targetCountries: [] as string[],
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
  h.update.mockReset().mockResolvedValue({ id: "e1" });
  h.publish.mockReset().mockResolvedValue({ id: "e1" });
  h.push.mockReset();
  h.saveDefaults.mockReset();
  h.addresses = [{ id: "addr1", type: "TESLIMAT", title: "Depo", city: "İzmir", isDefault: true }];
  sessionStorage.clear();
  h.defaults = { data: { defaults: SAVED, source: "saved" }, isLoading: false };
  h.denied = [];
  h.existingDocs = [];
  h.verification = "VERIFIED";
});

describe("QuickRequest", () => {
  it("kalemler sihirbaz satırlarıyla girilir, başlık yayında kalemlerden türetilir, şartlar profilden gelir; yayın sihirbaz gövdesini üretir", async () => {
    h.create.mockResolvedValue({ id: "l1", number: "ROT-000042" });
    wrap(<QuickRequest />);
    // Sihirbazla aynı satır: Kalem Adı · Miktar · Birim · Stok Kodu + üç düğme
    const name1 = await screen.findByLabelText(/^Kalem Adı/);
    expect(screen.getByRole("button", { name: /Katalogdan Ekle/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Excel ile İçe Aktar/ })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Belgeden Doldur/ })).toBeInTheDocument();
    expect(screen.queryByRole("textbox", { name: "Ne lazım?" })).toBeNull();
    fireEvent.change(name1, { target: { value: "çelik boru" } });
    fireEvent.change(screen.getByLabelText(/^Miktar/), { target: { value: "1200" } });
    fireEvent.change(screen.getByLabelText(/^Birim/), { target: { value: "M" } });
    fireEvent.click(screen.getByRole("button", { name: /Yeni Kalem Ekle/ }));
    const names = screen.getAllByLabelText(/^Kalem Adı/);
    expect(names).toHaveLength(2);
    fireEvent.change(names[1], { target: { value: "vida M8" } });
    fireEvent.change(screen.getAllByLabelText(/^Miktar/)[1], { target: { value: "500" } });
    // Şartlar paneli profilden
    expect(screen.getByText("Kaynak: talep şartlarınız")).toBeInTheDocument();
    expect(screen.getAllByText(/Vadeli/).length).toBeGreaterThan(0);
    // Kapsam: bağlantılarım seçili; özet dolu
    expect(screen.getByRole("button", { name: /^Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getByText("2 kalem · Dağıtım panoları")).toBeInTheDocument();
    // Kime: bağlantı sayısı gerçek veriden; herkese açıkta dizin sayısı
    expect(screen.getByText(/Bağlantınız olmadığı için bu talebi kimse görmez/)).toBeInTheDocument();
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
    });
    // Kapalı zarf anahtarı yok (T-16): alan gönderilmez, API varsayılanı true.
    expect(body.isSealedBid).toBeUndefined();
    expect(body.items).toHaveLength(2);
    expect(body.items[0]).toMatchObject({ name: "çelik boru", quantity: 1200, unitCode: "M" });
    expect(body.asDraft).toBeUndefined();
    expect(await screen.findByText("Talebiniz yayında")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "Talebi gör" })).toHaveAttribute("href", "/company/ilan/l1");
  }, 30_000); // sihirbaz satırları (birim seçici × 2) tam suite yükünde 15 sn'yi aşabiliyor

  it("Bağlantılarım = görünürlük listesi: hepsi işaretli başlar; biri çıkarılınca yayın PRIVATE + yalnız kalanlar gider", async () => {
    h.create.mockResolvedValue({ id: "l2", number: "ROT-000043" });
    h.connections = [
      { connectionId: "c1", origin: "SENT", decidedAt: null, company: { id: "1", name: "Beta Kimya", rothernId: "BETA-0001", city: "Kocaeli", industry: "Kimya" } },
      { connectionId: "c2", origin: "SENT", decidedAt: null, company: { id: "2", name: "Ege Makina", rothernId: "EGEM-0001", city: "Manisa", industry: "Makine" } },
    ];
    try {
      wrap(<QuickRequest />);
      const name1 = await screen.findByLabelText(/^Kalem Adı/);
      fireEvent.change(name1, { target: { value: "çelik boru" } });
      // Bağlantılarım seçili → iki bağlantı da işaretli, açıklama "tamamı görecek"
      await waitFor(() => expect(screen.getByText(/2 bağlantınızın tamamı görecek/)).toBeInTheDocument());
      const region = screen.getByRole("region", { name: "Bağlantılarım" });
      expect(within(region).getByRole("checkbox", { name: "Beta Kimya seç" })).toBeChecked();
      fireEvent.click(within(region).getByRole("checkbox", { name: "Beta Kimya seç" }));
      expect(screen.getByText(/2 bağlantınızdan 1 firma görecek; çıkardığınız 1 firma talebi görmez/)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      const body = h.create.mock.calls[0][0];
      expect(body.visibility).toBe("PRIVATE");
      expect(body.invitations).toEqual(["EGEM-0001"]);
    } finally {
      h.connections = [];
    }
  }, 30_000);

  it("S083/S095: 50'den (ve 200'den) fazla bağlantı Bağlantılarım ile yayınlanır; tüm liste TEK gövdede", async () => {
    h.create.mockResolvedValue({ id: "l9", number: "ROT-000049" });
    h.connections = Array.from({ length: 260 }, (_, i) => ({
      connectionId: `c${i}`,
      origin: "SENT",
      decidedAt: null,
      company: { id: `${i}`, name: `Firma ${i}`, rothernId: `F${String(i).padStart(3, "0")}-0001`, city: "İzmir", industry: "Makine" },
    }));
    try {
      wrap(<QuickRequest />);
      fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
      await waitFor(() => expect(screen.getByText(/260 bağlantınızın tamamı görecek/)).toBeInTheDocument());
      fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      const body = h.create.mock.calls[0][0];
      expect(body.visibility).toBe("CONNECTIONS");
      expect(new Set(body.invitations).size).toBe(260);
    } finally {
      h.connections = [];
    }
  }, 30_000);

  it("S083: varsayılan TESLİMAT adresi şartlardan SONRA gelen adreslerle de seçilir; FATURA adresi seçilmez", async () => {
    h.create.mockResolvedValue({ id: "l10", number: "ROT-000050" });
    h.defaults = { data: { defaults: { ...SAVED, deliveryAddressId: null }, source: "saved" }, isLoading: false };
    h.addresses = undefined;
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
    const { rerender } = render(<QueryClientProvider client={qc}><QuickRequest /></QueryClientProvider>);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    // Adresler şartlardan sonra döner (soğuk açılış yarışı); FATURA önce sıralı.
    h.addresses = [
      { id: "bill", type: "FATURA", title: "Merkez", city: "İstanbul", isDefault: true },
      { id: "depo", type: "TESLIMAT", title: "Depo", city: "İzmir", isDefault: false },
    ];
    rerender(<QueryClientProvider client={qc}><QuickRequest /></QueryClientProvider>);
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0].deliveryAddressId).toBe("depo");
  }, 30_000);

  it("S083: 'Yeni talep aç' formu profil şartları ve varsayılan adresle açar; ikinci talep yayınlanır", async () => {
    h.create.mockResolvedValueOnce({ id: "l11", number: "ROT-000051" }).mockResolvedValueOnce({ id: "l12", number: "ROT-000052" });
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    fireEvent.click(await screen.findByRole("button", { name: "Yeni talep aç" }));
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "vida M8" } });
    fireEvent.click(await screen.findByRole("button", { name: /Kategori seç/ }));
    // Taslak saklama yeniden çalışır (yenilemede girilenler kaybolmaz).
    await waitFor(() => expect(sessionStorage.getItem("quick-request-draft") ?? "").toContain("vida M8"));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(2));
    expect(h.create.mock.calls[1][0]).toMatchObject({
      deliveryTerm: "DOMESTIC_DELIVERED",
      paymentCategory: "DEFERRED",
      paymentDays: 45,
      deliveryAddressId: "addr1",
    });
    expect(h.create.mock.calls[1][0].items[0]).toMatchObject({ name: "vida M8" });
  }, 30_000);

  it("AI keşfinden eklenen dış davetler yayından ÖNCE gitmez; yayında talebe özel uçla ALICININ diliyle gider, sonuç panelde", async () => {
    // Yayın öncesi modal alıcıları forma ekler (modal burada sahte) — taslakta
    // saklanan liste geri yüklenir. Eski taslak düz adres taşıyabilir: dili
    // kuraldan türetilir (.kz → Rusça).
    sessionStorage.setItem(
      "quick-request-draft",
      JSON.stringify({ externalInvites: ["info@firma.kz", { email: "satis@kask.com", locale: "en", country: "DE" }] }),
    );
    h.create.mockResolvedValue({ id: "l3", number: "ROT-000044" });
    h.sendExternal.mockReset().mockResolvedValue([{ email: "info@firma.kz", status: "SENT" }]);
    wrap(<QuickRequest />);
    expect(await screen.findByText("Yayında davet gidecek adresler (2)")).toBeInTheDocument();
    const lang = screen.getByLabelText("info@firma.kz için davet dili") as HTMLSelectElement;
    expect(lang.value).toBe("ru");
    expect((screen.getByLabelText("satis@kask.com için davet dili") as HTMLSelectElement).value).toBe("en");
    // Davet eden dili satırda değiştirir.
    fireEvent.change(lang, { target: { value: "en" } });
    fireEvent.click(screen.getByRole("button", { name: "satis@kask.com adresini kaldır" }));
    expect(screen.getByText("Yayında davet gidecek adresler (1)")).toBeInTheDocument();
    expect(h.sendExternal).not.toHaveBeenCalled();
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({
        listingId: "l3",
        invites: [{ email: "info@firma.kz", locale: "en" }],
        source: "AI_FORM",
      }),
    );
    expect(await screen.findByText("Davet e-postaları")).toBeInTheDocument();
    expect(screen.getByText("1 davet sıraya alındı — e-postalar alıcının ülkesinde mesai saatinde gönderilir")).toBeInTheDocument();
  }, 30_000);

  it("KALEMLER PANELİ: AI'ın bulduğu firmalar SEÇİLİ gelir; çıkarılan gitmez; yayında kalanlara AI_FORM daveti", async () => {
    // 2026-09-27, kullanıcı: "kalemler kısmında AI ile tedarikçi bul; aday
    // seçme şansı olsun ama otomatik seçili olsun".
    sessionStorage.clear();
    h.create.mockResolvedValue({ id: "l7", number: "ROT-000070" });
    h.sendExternal.mockReset().mockResolvedValue([{ email: "info@viti.it", status: "QUEUED" }]);
    h.externalSearch.mockReset().mockResolvedValue([
      { name: "Viti Srl", email: "info@viti.it", country: "IT", city: "Milano", website: "viti.it", reason: "Cıvata üreticisi", matchedItems: [1], scope: "ABROAD", status: "SUGGESTED" },
      { name: "Cıvata AŞ", email: "satis@civata.com.tr", country: "TR", city: "Bursa", website: null, reason: "Yerli üretici", matchedItems: [1], scope: "LOCAL", status: "SUGGESTED" },
      { name: "Davetli Ltd", email: "eski@davetli.com", country: "TR", city: null, website: null, reason: "r", matchedItems: [], scope: "LOCAL", status: "ALREADY_INVITED" },
    ]);
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "M6 cıvata" } });
    fireEvent.click(await screen.findByRole("button", { name: "AI ile tedarikçi bul" }));
    await waitFor(() => expect(h.externalSearch).toHaveBeenCalledWith(expect.objectContaining({ itemNames: ["M6 cıvata"] })));
    // İki uygun aday seçili; zaten davetli olan kilitli ve seçili değil.
    const viti = await screen.findByLabelText("Viti Srl seç");
    expect(viti).toBeChecked();
    expect(screen.getByLabelText("Cıvata AŞ seç")).toBeChecked();
    expect(screen.getByLabelText("Davetli Ltd seç")).toBeDisabled();
    expect(screen.getByText("Zaten davetli")).toBeInTheDocument();
    expect(screen.getByText(/Yayında 2 firmaya davet gidecek/)).toBeInTheDocument();
    // Yalnız API'nin kalemle eşleştirdiği adaylar "sağlayabilir" (O-057):
    // eşleşmesi boş dönen (Davetli Ltd) o kalemi karşılamış sayılmaz.
    expect(screen.getAllByText("Sağlayabileceği kalemler: M6 cıvata").length).toBe(2);
    // Alıcı yerli firmayı çıkarır.
    fireEvent.click(screen.getByLabelText("Cıvata AŞ seç"));
    expect(screen.getByText(/Yayında 1 firmaya davet gidecek/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    // Yayında otomatik arama ve firma adı varsayılan AÇIK gider.
    expect(h.create.mock.calls[0][0]).toMatchObject({ aiDiscovery: expect.any(Boolean), inviteShowName: true });
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({
        listingId: "l7",
        invites: [{ email: "info@viti.it", locale: "en", country: "IT" }],
        source: "AI_FORM",
      }),
    );
  }, 30_000);

  it("KALEMLER PANELİ — ROTHERN ÜYELERİ: en üstte, gerekçeli ve SEÇİLİ; yayında talebe DOĞRUDAN davet edilir", async () => {
    // 2026-09-28, kullanıcı: "sistemimize kayıtlıysa ayrıca gösterelim,
    // kategori veya kalem eşleşmesi var diye; davet ederken en üstte seçili".
    sessionStorage.clear();
    h.create.mockResolvedValue({ id: "l8", number: "ROT-000080" });
    h.sendExternal.mockReset().mockResolvedValue([{ email: "info@viti.it", status: "QUEUED" }]);
    h.inviteMembers.mockReset().mockResolvedValue([{ companyId: "co1", status: "INVITED" }]);
    h.platformSearch.mockReset().mockResolvedValue([
      { companyId: "co1", name: "Bağlantı AŞ", city: "Bursa", country: "TR", rothernId: "R1", matchedCategories: ["Cıvatalar"], strongMatch: true, matchedItems: [1], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co2", name: "Somun Ltd", city: null, country: "TR", rothernId: "R2", matchedCategories: [], strongMatch: true, matchedItems: [1], connectionStatus: "NONE", alreadyInvited: false },
    ]);
    h.externalSearch.mockReset().mockResolvedValue([
      { name: "Viti Srl", email: "info@viti.it", country: "IT", city: "Milano", website: "viti.it", reason: "r", matchedItems: [1], scope: "ABROAD", status: "SUGGESTED" },
      // Web'de bulunan ama adresi üyeyle eşleşen firma → üye satırına katılır.
      { name: "Bağlantı AŞ", email: "satis@baglanti.com", country: "TR", city: "Bursa", website: null, reason: "r", matchedItems: [1], scope: "LOCAL", status: "MEMBER", memberCompanyId: "co1" },
    ]);
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "M6 cıvata" } });
    fireEvent.click(await screen.findByRole("button", { name: "AI ile tedarikçi bul" }));
    const member = await screen.findByLabelText("Bağlantı AŞ seç");
    await waitFor(() => expect(member).toBeChecked());
    // Üye grubu listenin başında; web'de de bulunan üye tek satır.
    const groups = screen.getAllByRole("region").filter((r) => /Rothern'de kayıtlı|Yurt dışı/.test(r.getAttribute("aria-label") ?? ""));
    expect(groups[0]).toHaveAccessibleName("Rothern'de kayıtlı");
    expect(screen.getAllByLabelText("Bağlantı AŞ seç")).toHaveLength(1);
    expect(screen.getByText("Web'de de bulundu")).toBeInTheDocument();
    expect(screen.getByText("Kategori eşleşmesi: Cıvatalar")).toBeInTheDocument();
    await waitFor(() => expect(screen.getByText(/Yayında 3 firmaya davet gidecek/)).toBeInTheDocument());
    // D-092: "Kime" özeti ve rozet AI davetlerini de sayar; bağlantısızken "kimse görmez" demez.
    expect(screen.getByText("Yayında ayrıca AI ile bulunan 3 firmaya davet gider.")).toBeInTheDocument();
    expect(screen.queryByText(/Bağlantınız olmadığı için bu talebi kimse görmez/)).toBeNull();
    expect(screen.getAllByText("Bağlantılarım · 3 davet").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Seçtiklerim/ }));
    expect(screen.getByText("Yalnız davet ettiğiniz 3 firma görecek.")).toBeInTheDocument();
    expect(screen.queryByText(/Henüz kimse davet edilmedi/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Bağlantılarım/ }));
    // Alıcı bir üyeyi çıkarır.
    fireEvent.click(screen.getByLabelText("Somun Ltd seç"));
    expect(screen.getByText(/Talebe doğrudan davet edilecek Rothern üyeleri \(1\)/)).toBeInTheDocument();
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l8", companyIds: ["co1"] }));
    // Üyeye e-posta daveti GİTMEZ; yalnız web adayı kuyruğa.
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({
        listingId: "l8",
        invites: [{ email: "info@viti.it", locale: "en", country: "IT" }],
        source: "AI_FORM",
      }),
    );
    expect(await screen.findByText("Rothern üyeleri")).toBeInTheDocument();
  }, 30_000);

  it("1. bölüm: başlık → 'AI ile başlık ve kategori bul' → kategori (tek sütun); düğme kalemsiz pasif", async () => {
    // 2026-09-17, kullanıcı kararı: kategori seçimi başlığın ALTINDA; AI
    // düğmesi ikisinin arasında ve kalemleri okur.
    wrap(<QuickRequest />);
    const title = await screen.findByLabelText(/Talep başlığı/);
    const ai = screen.getByRole("button", { name: "AI ile başlık ve kategori bul" });
    const category = screen.getByRole("button", { name: "Kategori seç" });
    expect(title.compareDocumentPosition(ai) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ai.compareDocumentPosition(category) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(ai).toBeDisabled();
    // Modal açıklaması ALICIYA yazılmış olmalı (derin denetim S065) — modalın
    // mod bazlı varsayılanı tedarikçiye "davet alırsınız" diyordu.
    expect(category.getAttribute("data-description")).toMatch(/^Talebinizin kategorilerini/);
    // Kalem girilince düğme açılır.
    fireEvent.change(screen.getAllByPlaceholderText("Örn. A4 fotokopi kağıdı")[0], { target: { value: "Perçin M6" } });
    await waitFor(() => expect(ai).toBeEnabled());
  });

  it("O-068: incelemedeki (PENDING) firmaya 'belgeleri yükleyin' denmez; doğrulanmamışa denir", async () => {
    h.verification = "PENDING";
    const { unmount } = wrap(<QuickRequest />);
    expect(await screen.findByText(/Doğrulamanız inceleniyor; onaylanınca talebi yayınlayabilirsiniz/)).toBeInTheDocument();
    expect(screen.queryByText(/belgeleri yükleyin/)).toBeNull();
    unmount();

    h.verification = "UNVERIFIED";
    wrap(<QuickRequest />);
    expect(await screen.findByText(/belgeleri yükleyin/)).toBeInTheDocument();
  });

  it("boş kartta 'son taleplerden başla' çipi görünür", async () => {
    wrap(<QuickRequest />);
    expect(await screen.findByRole("button", { name: "Geçen ayki kablo alımı" })).toBeInTheDocument();
  });

  it("D-246: profil yoksa ve hiç bağlantı yoksa varsayılan görünürlük 'Herkese açık'; kayıtlı şart ezilmez", async () => {
    h.defaults = { data: { defaults: null, source: "none" }, isLoading: false };
    const first = wrap(<QuickRequest />);
    await waitFor(() => expect(screen.getByRole("button", { name: /^Herkese açık/ })).toHaveAttribute("aria-pressed", "true"));
    expect(screen.queryByText(/Bağlantınız olmadığı için bu talebi kimse görmez/)).toBeNull();
    first.unmount();
    sessionStorage.clear();
    // Kayıtlı şart "Bağlantılarım" ise bağlantı olmasa da DEĞİŞMEZ (kullanıcının seçimi).
    h.defaults = { data: { defaults: SAVED, source: "saved" }, isLoading: false };
    wrap(<QuickRequest />);
    expect(await screen.findByRole("button", { name: /^Bağlantılarım/ })).toHaveAttribute("aria-pressed", "true");
  });

  it("profil yoksa kurulum kartı; kaydedince profile yazılır", async () => {
    h.defaults = { data: { defaults: null, source: "none" }, isLoading: false };
    h.saveDefaults.mockResolvedValue({ defaults: SAVED, source: "saved" });
    wrap(<QuickRequest />);
    const card = (await screen.findByText("İlk talebiniz — üç kısa soru")).closest("div") as HTMLElement;
    expect(card).toBeInTheDocument();
    const btn = screen.getByRole("button", { name: "Kaydet ve devam et" });
    // 2026-09-21: platform varsayılanı "adrese teslim" → düğme açık; kullanıcı yine değiştirebilir.
    expect(btn).toBeEnabled();
    const select = within(card.parentElement as HTMLElement).getAllByRole("combobox")[0];
    fireEvent.change(select, { target: { value: "DOMESTIC_PICKUP" } });
    fireEvent.click(screen.getByRole("button", { name: "Kaydet ve devam et" }));
    await waitFor(() => expect(h.saveDefaults).toHaveBeenCalledTimes(1));
    expect(h.saveDefaults.mock.calls[0][0]).toMatchObject({ deliveryTerm: "DOMESTIC_PICKUP", targetCountries: [] });
    expect(screen.queryByText("İlk talebiniz — üç kısa soru")).toBeNull();
  });

  it("S083: belge yüklemesi sürerken 'Taslak kaydet' ve 'Talebi yayınla' kilitli — ikinci tık mükerrer talep açmaz", async () => {
    h.create.mockResolvedValue({ id: "l20", number: "ROT-000060" });
    let finishUpload: () => void = () => {};
    h.upload.mockReset().mockImplementation(() => new Promise<void>((r) => (finishUpload = r)));
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    fireEvent.click(screen.getByRole("button", { name: "Test belgesi ekle" }));
    const draftBtn = screen.getByRole("button", { name: "Taslak kaydet" });
    fireEvent.click(draftBtn);
    await waitFor(() => expect(h.upload).toHaveBeenCalledTimes(1));
    // create çözüldü, yükleme sürüyor: düğmeler kapalı, tık yeni kayıt açmaz.
    expect(draftBtn).toBeDisabled();
    fireEvent.click(draftBtn);
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla|Kaydediliyor/ })[0]);
    expect(h.create).toHaveBeenCalledTimes(1);
    finishUpload();
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/l20"));
    expect(h.create).toHaveBeenCalledTimes(1);
  }, 30_000);

  it("S083: 'Tümünü düzenle' yalnız talebe uygulanan şartları açar (görünürlük/kapanış/adres talebin kendi bölümünde)", async () => {
    wrap(<QuickRequest />);
    await screen.findByLabelText(/^Kalem Adı/);
    const panel = screen.getByRole("region", { name: "Ticari şartlar" });
    fireEvent.click(within(panel).getByRole("button", { name: /Tümünü düzenle/ }));
    expect(within(panel).getByLabelText("Teslim şekli")).toBeInTheDocument();
    expect(within(panel).queryByText("Kimler görsün")).toBeNull();
  }, 30_000);

  it("O-083: taslak bandındaki 'Temizle, sıfırdan başla' varsayılan teslimat adresini seçer ve tüm bağlantıları işaretler", async () => {
    h.defaults = { data: { defaults: null, source: "none" }, isLoading: false };
    h.addresses = [{ id: "depo", type: "TESLIMAT", title: "Depo", city: "İzmir", isDefault: true }];
    h.connections = [
      { connectionId: "c1", origin: "SENT", decidedAt: null, company: { id: "1", name: "Beta Kimya", rothernId: "BETA-0001", city: "Kocaeli", industry: "Kimya" } },
      { connectionId: "c2", origin: "SENT", decidedAt: null, company: { id: "2", name: "Ege Makina", rothernId: "EGEM-0001", city: "Manisa", industry: "Makine" } },
    ];
    // Geri getirilen taslakta adres boş, bağlantılar çıkarılmış.
    sessionStorage.setItem(
      "quick-request-draft",
      JSON.stringify({ title: "Eski taslak", description: "", items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "eski kalem" }], categoryIds: [], keywords: [], deliveryAddressId: "", visibility: "CONNECTIONS", invitedSupplierIds: [], bidsCloseAt: "" }),
    );
    try {
      wrap(<QuickRequest />);
      fireEvent.click(await screen.findByRole("button", { name: "Temizle, sıfırdan başla" }));
      await waitFor(() => expect(screen.getByRole("button", { name: /^Depo/ })).toHaveAttribute("aria-pressed", "true"));
      expect(screen.getByText(/2 bağlantınızın tamamı görecek/)).toBeInTheDocument();
      expect(screen.queryByText("Kaldığınız taslak geri yüklendi.")).toBeNull();
      expect(screen.getAllByLabelText(/^Kalem Adı/)[0]).toHaveValue("");
    } finally {
      h.connections = [];
    }
  }, 30_000);

  it("O-084: taslak kaydedilince oturum taslağı silinir ve geri yazılmaz", async () => {
    h.create.mockResolvedValue({ id: "l30", number: "ROT-000070" });
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    await waitFor(() => expect(sessionStorage.getItem("quick-request-draft") ?? "").toContain("çelik boru"));
    fireEvent.click(screen.getByRole("button", { name: "Taslak kaydet" }));
    await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/l30"));
    // `finally`'deki yeniden çizimden SONRA da boş kalır.
    await waitFor(() => expect(screen.getByRole("button", { name: "Taslak kaydet" })).toBeEnabled());
    expect(sessionStorage.getItem("quick-request-draft")).toBeNull();
  }, 30_000);

  it("D-243: kurulum kartı kayıt başarısızsa kapanmaz", async () => {
    h.defaults = { data: { defaults: null, source: "none" }, isLoading: false };
    h.saveDefaults.mockRejectedValue(new Error("500"));
    wrap(<QuickRequest />);
    await screen.findByText("İlk talebiniz — üç kısa soru");
    fireEvent.click(screen.getByRole("button", { name: "Kaydet ve devam et" }));
    await waitFor(() => expect(h.saveDefaults).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(screen.getByRole("button", { name: "Kaydet ve devam et" })).toBeEnabled());
    expect(screen.getByText("İlk talebiniz — üç kısa soru")).toBeInTheDocument();
  });

  it("D-095: kapanış belirli gün ve saate ayarlanabilir; yayın o anı gönderir", async () => {
    h.create.mockResolvedValue({ id: "l31", number: "ROT-000071" });
    wrap(<QuickRequest />);
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
    const day = closesAtFromDays(10).slice(0, 10);
    fireEvent.change(screen.getByLabelText("Kapanış günü"), { target: { value: day } });
    fireEvent.change(screen.getByLabelText("Kapanış saati"), { target: { value: "17:00" } });
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    expect(h.create.mock.calls[0][0].closesAt).toBe(parseAppWallClockInput(`${day}T17:00`)?.toISOString());
  }, 30_000);

  it("NUM:NEW-7: geçersiz 'Özel gün' ('12,50') kapanışı önekle değiştirmez; taslak ve yayın durur, kutuya odaklanır", async () => {
    h.create.mockResolvedValue({ id: "l32", number: "ROT-000072" });
    const toastError = vi.spyOn(toast, "error");
    try {
      wrap(<QuickRequest />);
      fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
      const box = screen.getByLabelText("Özel gün") as HTMLInputElement;
      const before = (screen.getByLabelText("Kapanış günü") as HTMLInputElement).value;
      fireEvent.focus(box);
      for (const typed of ["", "1", "12", "12,", "12,5", "12,50"]) fireEvent.change(box, { target: { value: typed } });
      // Önekler ("1", "12") kapanışa yazılmadı: kapanış son onaylı değerde (7 gün).
      expect((screen.getByLabelText("Kapanış günü") as HTMLInputElement).value).toBe(before);
      expect(box).toHaveAttribute("aria-invalid", "true");
      fireEvent.blur(box);
      fireEvent.click(screen.getByRole("button", { name: "Taslak kaydet" }));
      expect(toastError).toHaveBeenCalledWith("1–60 gün arası tam sayı girin.");
      expect(document.activeElement).toBe(box);
      fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
      toastError.mockClear();
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      expect(toastError).toHaveBeenCalledWith("1–60 gün arası tam sayı girin.");
      await new Promise((r) => setTimeout(r, 0));
      expect(h.create).not.toHaveBeenCalled();
      // "12" + odaktan çıkış 12 günü onaylar; yayın o kapanışla gider.
      fireEvent.change(box, { target: { value: "12" } });
      fireEvent.blur(box);
      expect((screen.getByLabelText("Kapanış günü") as HTMLInputElement).value).toBe(closesAtFromDays(12).slice(0, 10));
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
    } finally {
      toastError.mockRestore();
    }
  }, 30_000);

  it("D-042: adres/şablon yönetme izni yoksa '+ Yeni adres' ve 'Şablon olarak kaydet' çizilmez", async () => {
    h.denied = ["addresses:manage", "templates:manage"];
    wrap(<QuickRequest />);
    await screen.findByLabelText(/^Kalem Adı/);
    expect(screen.queryByRole("button", { name: "+ Yeni adres" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Şablon olarak kaydet" })).toBeNull();
    // Talep izni olduğu için yayın/taslak düğmeleri durur.
    expect(screen.getByRole("button", { name: "Taslak kaydet" })).toBeInTheDocument();
  });

  it("D-150: çok adresli firmada seçili + ilk kartlar görünür; 'Tüm adresler' aranabilir liste açar", async () => {
    h.addresses = Array.from({ length: 30 }, (_, i) => ({ id: `a${i}`, type: "TESLIMAT", title: `Şube ${i}`, city: "İzmir", isDefault: i === 0 }));
    wrap(<QuickRequest />);
    await screen.findByLabelText(/^Kalem Adı/);
    expect(screen.getAllByRole("button", { name: /^Şube \d+/ })).toHaveLength(4);
    fireEvent.click(screen.getByRole("button", { name: "Tüm adresler (30)" }));
    fireEvent.change(screen.getByRole("searchbox", { name: "Adres ara…" }), { target: { value: "Şube 27" } });
    fireEvent.click(screen.getByRole("button", { name: /^Şube 27/ }));
    // Seçim sonrası liste kapanır; seçili adres kapalı görünümde kalır.
    expect(screen.getByRole("button", { name: /^Şube 27/ })).toHaveAttribute("aria-pressed", "true");
    expect(screen.getAllByRole("button", { name: /^Şube \d+/ })).toHaveLength(4);
  }, 30_000);

  describe("düzenleme (derin denetim Y-19 / Y-20)", () => {
    // Talebin kendi şartları firma varsayılanından (SAVED: bağlantılarım, TRY,
    // vadeli 45 gün, 7 gün) FARKLI: özel, USD, akreditif, kapanış 20 gün sonra.
    const closesAt = closesAtFromDays(20);
    const listing = (): TenderFormData => ({
      ...DEFAULT_FORM_VALUES,
      title: "Çelik boru alımı",
      categoryIds: ["39121600"],
      visibility: "PRIVATE",
      invitedSupplierIds: ["BETA-0001"],
      deliveryTerm: "FOB",
      paymentCategory: "LETTER_OF_CREDIT",
      lcType: "SIGHT",
      paymentDays: undefined,
      primaryCurrency: "USD",
      allowedCurrencies: ["USD"],
      bidVisibility: "OWN_ONLY",
      bidsCloseAt: closesAt,
      deliveryAddressId: "addr1",
      items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "çelik boru", quantity: 10, unit: "adet" }],
    });

    it("taslak düzenlemede talebin şartları profil varsayılanıyla EZİLMEZ; taslak kaydı asDraft ile gider; yeni talep taslağına sızmaz", async () => {
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="DRAFT" initialValues={listing()} />);
      // Şartlar paneli talebin kendisini gösterir.
      expect(await screen.findByText("Kaynak: bu talebin şartları")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      const body = h.update.mock.calls[0][0];
      expect(body).toMatchObject({
        visibility: "PRIVATE",
        invitations: ["BETA-0001"],
        deliveryTerm: "FOB",
        paymentCategory: "LETTER_OF_CREDIT",
        lcType: "SIGHT",
        primaryCurrency: "USD",
        allowedCurrencies: ["USD"],
        asDraft: true,
      });
      expect(body.isSealedBid).toBeUndefined();
      expect(body.closesAt).toBe(parseAppWallClockInput(closesAt)?.toISOString());
      expect(h.publish).not.toHaveBeenCalled();
      // Düzenlenen talep yeni talep taslağı anahtarına YAZILMAZ.
      expect(sessionStorage.getItem("quick-request-draft")).toBeNull();
    }, 30_000);

    it("yayındaki (teklifsiz) talepte birincil düğme 'Değişiklikleri kaydet': yayın ucu ÇAĞRILMAZ, bekleyen davetler hemen gider", async () => {
      sessionStorage.setItem("quick-request-external-invites:e1", JSON.stringify([{ email: "info@viti.it", locale: "en", country: "IT" }]));
      h.sendExternal.mockReset().mockResolvedValue([{ email: "info@viti.it", status: "QUEUED" }]);
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" initialValues={listing()} />);
      const save = await screen.findByRole("button", { name: "Değişiklikleri kaydet" });
      // Yayındaki talep taslak değil — taslak düğmesi ve "Talebi yayınla" yok.
      expect(screen.queryByRole("button", { name: "Taslağı kaydet" })).toBeNull();
      expect(screen.queryByRole("button", { name: /Talebi yayınla/ })).toBeNull();
      fireEvent.click(save);
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0]).toMatchObject({ visibility: "PRIVATE", primaryCurrency: "USD", paymentCategory: "LETTER_OF_CREDIT" });
      expect(h.update.mock.calls[0][0].asDraft).toBeUndefined();
      await waitFor(() =>
        expect(h.sendExternal).toHaveBeenCalledWith({ listingId: "e1", invites: [{ email: "info@viti.it", locale: "en", country: "IT" }], source: "AI_FORM" }),
      );
      expect(h.publish).not.toHaveBeenCalled();
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/e1"));
      expect(sessionStorage.getItem("quick-request-external-invites:e1")).toBeNull();
    }, 30_000);

    it("MU-26 gözden geçirme: yayındaki Bağlantılarım talebi 260 bağlantıyla kaydedilir — tüm liste güncelleme gövdesinde, ayrı davet çağrısı yok", async () => {
      // Sunucu güncellemede davetleri gövdeden yeniden yazar; gövdeye sığmayan
      // kısmı ayrı davet ucuyla göndermek o firmaları her kayıtta "yeni
      // davetli" sayıp yeniden e-posta attırıyordu.
      h.connections = Array.from({ length: 260 }, (_, i) => ({
        connectionId: `c${i}`,
        origin: "SENT",
        decidedAt: null,
        company: { id: `${i}`, name: `Firma ${i}`, rothernId: `F${String(i).padStart(3, "0")}-0001`, city: "İzmir", industry: "Makine" },
      }));
      const ids = (h.connections as { company: { rothernId: string } }[]).map((c) => c.company.rothernId);
      try {
        wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" initialValues={{ ...listing(), visibility: "CONNECTIONS", invitedSupplierIds: ids }} />);
        fireEvent.click(await screen.findByRole("button", { name: "Değişiklikleri kaydet" }));
        await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
        const body = h.update.mock.calls[0][0];
        expect(body.visibility).toBe("CONNECTIONS");
        expect(new Set(body.invitations)).toEqual(new Set(ids));
        await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/e1"));
      } finally {
        h.connections = [];
      }
    }, 30_000);

    it("O-087: düzenlemede 4. bölüm talebin mevcut belgelerini (FilesTab) gösterir, sayaç onlardan", async () => {
      h.existingDocs = [{ id: "d1" }, { id: "d2" }];
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="DRAFT" initialValues={listing()} />);
      const tab = await screen.findByTestId("files-tab");
      expect(tab).toHaveAttribute("data-listing", "e1");
      expect(tab).toHaveAttribute("data-can-edit", "true");
      expect(screen.queryByTestId("staged-docs")).toBeNull();
      expect(screen.getAllByText("2 dosya").length).toBeGreaterThan(0);
    }, 30_000);

    it("taslak düzenlemede 'Talebi yayınla' önce günceller sonra yayınlar", async () => {
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="DRAFT" initialValues={listing()} />);
      fireEvent.click((await screen.findAllByRole("button", { name: /Talebi yayınla/ }))[0]);
      await waitFor(() => expect(h.publish).toHaveBeenCalledTimes(1));
      expect(h.update).toHaveBeenCalledTimes(1);
      expect(h.update.mock.calls[0][0]).toMatchObject({ visibility: "PRIVATE", primaryCurrency: "USD" });
    }, 30_000);

    it("kopya/şablon tohumu (seedTerms) kendi şartlarıyla açılır; kapanış boşsa profilden dolar", async () => {
      h.create.mockResolvedValue({ id: "l9", number: "ROT-000090" });
      wrap(<QuickRequest seedTerms initialValues={{ ...listing(), title: "Çelik boru alımı (2)", bidsCloseAt: "" }} />);
      expect(await screen.findByText("Kaynak: kopyalanan talep veya şablon")).toBeInTheDocument();
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      const body = h.create.mock.calls[0][0];
      expect(body).toMatchObject({ visibility: "PRIVATE", primaryCurrency: "USD", paymentCategory: "LETTER_OF_CREDIT", lcType: "SIGHT", deliveryTerm: "FOB" });
      expect(body.closesAt).toBeTruthy();
    }, 30_000);
  });
});
