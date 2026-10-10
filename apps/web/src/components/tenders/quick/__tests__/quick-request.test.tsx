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
  defaults: { data: undefined as unknown, isLoading: false } as {
    data: unknown;
    isLoading: boolean;
    isError?: boolean;
    refetch?: () => void;
  },
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
  // `useCategoriesByIds` çağrıları (id listesi + seçenek).
  byIds: vi.fn(),
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
  useCategoriesByIds: (...args: unknown[]) => {
    h.byIds(...args);
    return { data: [{ id: "39121600", nameTr: "Dağıtım panoları" }] };
  },
  useCategorySearchTree: () => ({ data: { segments: [{ id: "40000000", code: "40000000", nameTr: "Boru", level: 1, segmentLetter: null, families: [{ id: "40170000", code: "40170000", nameTr: "Borular", level: 2, classes: [{ id: "40171500", code: "40171500", nameTr: "Çelik borular", level: 3, isMatch: true, commodities: [] }] }] }] } }),
}));
vi.mock("@/components/categories/category-selector-button", () => ({
  // `retiredHint`: form, gizli kodu değerden ÇIKARDIĞI için alanın kendi
  // "önceki kategori kullanılmıyor" notunu ayrıca ister (gözden geçirme R-WEB-01).
  // `retiredOptional`: notun sözü — yayındaki talepte seçim istenmez (CP-04).
  CategorySelectorButton: ({ value, onChange, modalDescription, retiredHint, retiredOptional }: { value: string[]; onChange: (ids: string[]) => void; modalDescription?: string; retiredHint?: boolean; retiredOptional?: boolean }) => (
    <>
      <button type="button" data-description={modalDescription} data-retired-hint={String(!!retiredHint)} data-retired-optional={String(!!retiredOptional)} onClick={() => onChange(["39121600"])}>{value.length ? `Kategori: ${value[0]}` : "Kategori seç"}</button>
      {value.length ? <button type="button" onClick={() => onChange([])}>Kategorileri boşalt</button> : null}
    </>
  ),
}));

import { toast } from "sonner";
import { QuickRequest } from "../quick-request";
import { DEFAULT_FORM_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { companyApi } from "@/lib/company-auth/api";
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

/**
 * Son canlı kontrol 2026-10-10, OUTF-2: talep şartları okunamayınca form kesinti
 * boyunca iskelette kalıyordu (15 sn, 26 sn, 160 sn sonra da) — hata durumu ve
 * yeniden deneme yoktu.
 */
describe("QuickRequest — talep şartları okunamadı (OUTF-2)", () => {
  it("kesintide iskelette KALMAZ: hata durumu + 'Tekrar dene' şartları yeniden ister", () => {
    const refetch = vi.fn();
    h.defaults = { data: undefined, isLoading: false, isError: true, refetch };
    const { container } = wrap(<QuickRequest />);
    expect(screen.getByRole("alert")).toHaveTextContent("Talep formu yüklenemedi");
    expect(container.querySelector(".animate-pulse")).toBeNull();
    expect(container.querySelector("[aria-busy]")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Tekrar dene" }));
    expect(refetch).toHaveBeenCalledTimes(1);
  });

  it("yanıt beklenirken (yeniden deneme dahil) iskelet: hata kartı çizilmez", () => {
    h.defaults = { data: undefined, isLoading: true, isError: false };
    const { container } = wrap(<QuickRequest />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(container.querySelector("[aria-busy]")).not.toBeNull();
  });
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
      // Talep artık yalnız seçilenlere açılacak (özel) → AI kutusu işaretli
      // görünüp sessizce kapanmaz: kapalı ve nedenini söyler.
      const ai = screen.getByRole("checkbox", { name: /AI yurt içinde ve yurt dışında tedarikçi bulsun ve davet etsin/ });
      expect(ai).toBeDisabled();
      expect(ai).not.toBeChecked();
      expect(screen.getByText(/Bağlantılarınızdan bazılarını çıkardınız/)).toBeInTheDocument();
      fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      const body = h.create.mock.calls[0][0];
      expect(body.visibility).toBe("PRIVATE");
      expect(body.invitations).toEqual(["EGEM-0001"]);
      expect(body.aiDiscovery).toBe(false);
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

  it("ESKİ TASLAK: saklanmış dış davet seçimleri yayından ÖNCE gitmez; yayında talebe özel uçla ALICININ diliyle gider, sonuç panelde", async () => {
    // Form artık kendisi tedarikçi aramıyor (2026-10-08); daha önce saklanmış
    // taslaktaki liste bozulmadan geri yüklenir. Çok eski taslak düz adres
    // taşıyabilir: dili kuraldan türetilir (.kz → Rusça).
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

  it("AI KUTUSU (2026-10-08): form kendisi tedarikçi ARAMAZ, kalemlerin altında AI tedarikçi kutusu YOK; kutu 'bulsun ve davet etsin' der, yayın yalnız aiDiscovery gönderir", async () => {
    // Sahip: "kutu seçildiği anda AI arasın ve göndersin, bir daha soru
    // sormasın; kutu falan gelmesine gerek yok, arkada arasın".
    sessionStorage.clear();
    h.create.mockResolvedValue({ id: "l7", number: "ROT-000070" });
    h.sendExternal.mockReset();
    h.inviteMembers.mockReset();
    h.externalSearch.mockClear();
    h.platformSearch.mockClear();
    const timers = vi.spyOn(globalThis, "setTimeout");
    try {
      wrap(<QuickRequest />);
      fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "M6 cıvata" } });
      // Eski panelin hiçbir parçası yok: başlık, "AI ile tedarikçi bul" düğmesi, aday listesi.
      expect(screen.queryByText("Bu kalemleri kim satıyor?")).not.toBeInTheDocument();
      expect(screen.queryByRole("button", { name: "AI ile tedarikçi bul" })).not.toBeInTheDocument();
      expect(document.getElementById("ai-tedarikci")).toBeNull();
      expect(screen.queryByRole("button", { name: "Listeye git" })).not.toBeInTheDocument();
      // 5 sn'lik kendiliğinden arama zamanlayıcısı da kurulmaz.
      expect(timers.mock.calls.filter((c) => c[1] === 5_000)).toHaveLength(0);

      // Kutu ne yapacağını söyler; varsayılan açık.
      const ai = screen.getByRole("checkbox", { name: /^Yayınlayınca AI yurt içinde ve yurt dışında tedarikçi bulsun ve davet etsin/ });
      expect(ai).toBeChecked();
      expect(ai).toBeEnabled();
      expect(screen.getByText(/Arka planda çalışır: bulduğu firmaları sizin adınıza, talebin kalemleriyle birlikte kendisi davet eder; ayrıca onay istemez\./)).toBeInTheDocument();
      expect(screen.getByText(/Ücretsiz\./)).toBeInTheDocument();
      // AI-UI-4: başlık dar ekranda sarınca simge ezilmez (flex satırında shrink-0) ve ilk satırla hizalı kalır.
      const sparkle = ai.closest("label")!.querySelector("svg")!;
      expect(sparkle).toHaveClass("h-4", "w-4", "shrink-0");
      expect(sparkle.parentElement).toHaveClass("items-start");
      // Özel talepte kullanılamaz.
      fireEvent.click(screen.getByRole("button", { name: /^Seçtiklerim/ }));
      expect(ai).toBeDisabled();
      expect(ai).not.toBeChecked();
      // AI-UI-3: neden, tıklanan seçeneğin KENDİ adını söyler — form bu seçeneğe hiçbir yerde "Özel" demez.
      const reason = screen.getByText(/seçiliyken AI tedarikçi arayıp davet etmez/);
      expect(reason).toHaveTextContent("“Seçtiklerim” seçiliyken AI tedarikçi arayıp davet etmez; talebi yalnız davet ettiğiniz firmalar görür.");
      expect(ai.closest("label")).not.toHaveTextContent(/Özel/);
      fireEvent.click(screen.getByRole("button", { name: /^Bağlantılarım/ }));
      expect(ai).toBeChecked();

      fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      expect(h.create.mock.calls[0][0]).toMatchObject({ aiDiscovery: true, inviteShowName: true });
      // Aramayı ve daveti sunucudaki tur yapar: formdan arama/davet isteği çıkmaz.
      expect(await screen.findByText("Talebiniz yayında")).toBeInTheDocument();
      expect(h.externalSearch).not.toHaveBeenCalled();
      expect(h.platformSearch).not.toHaveBeenCalled();
      expect(h.sendExternal).not.toHaveBeenCalled();
      expect(h.inviteMembers).not.toHaveBeenCalled();
      // Yayın panelinde onaylanacak bir şey yok.
      expect(screen.queryByRole("button", { name: /firmaya davet gönder/ })).not.toBeInTheDocument();
      expect(screen.queryAllByRole("checkbox")).toHaveLength(0);
    } finally {
      timers.mockRestore();
    }
  }, 30_000);

  it("ESKİ TASLAK — ROTHERN ÜYELERİ: saklanmış üye + dış davet seçimleri bozulmadan okunur, 'Kime' özeti sayar, yayında talebe DOĞRUDAN davet edilir", async () => {
    // AI paneli kaldırılmadan önce saklanmış taslak (`QuickDraft.memberInvites` /
    // `externalInvites`): alıcının o gün seçtiği firmalar kaybolmaz.
    sessionStorage.setItem(
      "quick-request-draft",
      JSON.stringify({
        memberInvites: [
          { companyId: "co1", name: "Bağlantı AŞ" },
          { companyId: "co2", name: "Somun Ltd" },
          { bozuk: true },
        ],
        externalInvites: [{ email: "info@viti.it", locale: "en", country: "IT" }],
      }),
    );
    h.create.mockResolvedValue({ id: "l8", number: "ROT-000080" });
    h.sendExternal.mockReset().mockResolvedValue([{ email: "info@viti.it", status: "QUEUED" }]);
    h.inviteMembers.mockReset().mockResolvedValue([{ companyId: "co1", status: "INVITED" }]);
    wrap(<QuickRequest />);
    expect(await screen.findByText(/Talebe doğrudan davet edilecek Rothern üyeleri \(2\)/)).toBeInTheDocument();
    // D-092: "Kime" özeti ve rozet bu davetleri de sayar; bağlantısızken "kimse görmez" demez.
    expect(screen.getByText("Yayında ayrıca AI ile bulunan 3 firmaya davet gider.")).toBeInTheDocument();
    expect(screen.queryByText(/Bağlantınız olmadığı için bu talebi kimse görmez/)).toBeNull();
    expect(screen.getAllByText("Bağlantılarım · 3 davet").length).toBeGreaterThan(0);
    fireEvent.click(screen.getByRole("button", { name: /^Seçtiklerim/ }));
    expect(screen.getByText("Yalnız davet ettiğiniz 3 firma görecek.")).toBeInTheDocument();
    expect(screen.queryByText(/Henüz kimse davet edilmedi/)).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: /^Bağlantılarım/ }));
    // Kaldırılan panele giden bağlantı yok.
    expect(screen.queryByRole("button", { name: "Listeye git" })).not.toBeInTheDocument();
    // Alıcı bir üyeyi çıkarır.
    fireEvent.click(screen.getByRole("button", { name: "Somun Ltd davetini kaldır" }));
    expect(screen.getByText(/Talebe doğrudan davet edilecek Rothern üyeleri \(1\)/)).toBeInTheDocument();
    fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "M6 cıvata" } });
    fireEvent.click(await screen.findByRole("button", { name: "+ Çelik borular" }));
    fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l8", companyIds: ["co1"] }));
    // Üyeye e-posta daveti GİTMEZ; yalnız dış adres kuyruğa.
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

  // Kayıt denetimi 2026-10 webcat-5: kategori düğmesi aynı sorgu anahtarını
  // `inlineError` ile okur (hata kendi satırında). Seçeneksiz ikinci gözlemci
  // aynı ad hatasına genel toast da basıyordu.
  it("kategori adları düğmeyle AYNI seçenekle istenir (satır içi hata; genel toast yok)", async () => {
    h.byIds.mockClear();
    wrap(<QuickRequest />);
    await screen.findByLabelText(/^Kalem Adı/);
    fireEvent.click(screen.getByRole("button", { name: "Kategori seç" }));
    await screen.findByText("Kategori: 39121600");
    expect(h.byIds).toHaveBeenCalledWith(["39121600"], { inlineError: true });
    for (const [, options] of h.byIds.mock.calls) expect(options).toEqual({ inlineError: true });
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

  it("NUM:NEW-7 gözden geçirme: zaten seçili '7 gün' ya da tarih seçici geçersiz 'Özel gün' metnini temizler; taslak sürer", async () => {
    h.create.mockResolvedValue({ id: "l33", number: "ROT-000073" });
    const toastError = vi.spyOn(toast, "error");
    try {
      wrap(<QuickRequest />);
      fireEvent.change(await screen.findByLabelText(/^Kalem Adı/), { target: { value: "çelik boru" } });
      const box = screen.getByLabelText("Özel gün") as HTMLInputElement;
      const chip7 = screen.getByRole("button", { name: "7 gün" });
      expect(chip7).toHaveAttribute("aria-pressed", "true");
      // Seçili süre değişmeden aynı çip: kutu geçersiz metni atar.
      fireEvent.change(box, { target: { value: "12,50" } });
      fireEvent.blur(box);
      expect(box).toHaveAttribute("aria-invalid", "true");
      fireEvent.click(chip7);
      expect(box.value).toBe("7");
      expect(box).not.toHaveAttribute("aria-invalid");
      // Tarih seçiciden saat seçmek de (gün sayısı aynı kalsa bile) temizler.
      fireEvent.change(box, { target: { value: "0,5" } });
      fireEvent.blur(box);
      expect(box).toHaveAttribute("aria-invalid", "true");
      fireEvent.change(screen.getByLabelText("Kapanış saati"), { target: { value: "17:00" } });
      expect(box).not.toHaveAttribute("aria-invalid");
      expect(box.value).not.toBe("0,5");
      fireEvent.click(screen.getByRole("button", { name: "Taslak kaydet" }));
      await waitFor(() => expect(h.create).toHaveBeenCalledTimes(1));
      expect(toastError).not.toHaveBeenCalledWith("1–60 gün arası tam sayı girin.");
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

    it("AI-3: düzenleme kaydı formun davetli listesini OKUDUĞU anı geri gönderir (form açıkken turun davet ettiği üye silinmesin); sonradan yenilenen detay damgayı değiştirmez", async () => {
      // Form davetli listesini açılışta bir kez okur. Sunucu, o andan SONRA
      // otomatik tedarikçi aramasının yazdığı daveti — gövdede olmasa da —
      // silmemek için bu damgaya bakar.
      const readAt = "2026-10-09T08:00:00.000Z";
      const qc = new QueryClient({ defaultOptions: { queries: { retry: false, gcTime: 0 } } });
      const ui = (asOf: string) => (
        <QueryClientProvider client={qc}>
          <QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" initialValues={listing()} invitationsAsOf={asOf} />
        </QueryClientProvider>
      );
      const view = render(ui(readAt));
      const save = await screen.findByRole("button", { name: "Değişiklikleri kaydet" });
      // Sayfa detayı yeniden çekti (odak) — form eski listeyle kaldı, damga da.
      view.rerender(ui("2026-10-09T08:05:00.000Z"));
      fireEvent.click(save);
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0]).toMatchObject({ invitations: ["BETA-0001"], invitationsAsOf: readAt });
    }, 30_000);

    it("AI-3: taslak kaydı da damgayı taşır; damga vermeyen (eski API) detayda alan hiç yazılmaz", async () => {
      const first = wrap(
        <QuickRequest mode="edit" listingId="e1" listingStatus="DRAFT" initialValues={listing()} invitationsAsOf="2026-10-09T08:00:00.000Z" />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "Taslağı kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0]).toMatchObject({ asDraft: true, invitationsAsOf: "2026-10-09T08:00:00.000Z" });
      first.unmount();

      h.update.mockClear();
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="DRAFT" initialValues={listing()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Taslağı kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect("invitationsAsOf" in h.update.mock.calls[0][0]).toBe(false);
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

    /**
     * GİZLİ SEGMENT (2026-10-09, sahip kararı; arayüz denetimi W-11): eski
     * talebin gizli kategorisi (fikstür: görünür 46 sektörünün gizli ailesi
     * 4610, hafif silahlar — 2026-10-10) forma hiç girmez — çip
     * olarak çizilmez, kayda/yayına gönderilmez. Görünür kategorisi kalmayan
     * talepte formun kendi "kategori zorunlu" kuralı güncel bir kategori ister.
     */
    it("düzenleme: gizli kategori forma girmez; görünür kategori kalır ve kayıt yalnız onu gönderir", async () => {
      wrap(
        <QuickRequest
          mode="edit"
          listingId="e1"
          listingStatus="DRAFT"
          initialValues={{ ...listing(), categoryIds: ["46101500", "39121600"] }}
        />,
      );
      expect(await screen.findByRole("button", { name: "Kategori: 39121600" })).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Taslağı kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0].categoryIds).toEqual(["39121600"]);
      // Kategori adları da yalnız görünür kimlikle istenir (AI açıklama isteğine gizli ad sızmaz).
      expect(h.byIds.mock.calls.every((c) => !(c[0] as string[]).includes("46101500"))).toBe(true);
    }, 30_000);

    it("düzenleme: yalnız gizli kategorisi olan talep kategorisiz açılır; yayın 'kategori zorunlu' ile durur", async () => {
      wrap(
        <QuickRequest
          mode="edit"
          listingId="e1"
          listingStatus="DRAFT"
          initialValues={{ ...listing(), categoryIds: ["46101500"] }}
        />,
      );
      expect(await screen.findByRole("button", { name: "Kategori seç" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Kategori: 46/ })).toBeNull();
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      expect(await screen.findByText("En az 1 kategori seçmelisiniz")).toBeInTheDocument();
      expect(h.update).not.toHaveBeenCalled();
      expect(h.publish).not.toHaveBeenCalled();
    }, 30_000);

    /**
     * YAYINDAKİ ESKİ TALEP (gözden geçirme R-WEB-01). Sahip kuralı: değişmeyen
     * eski değer ilgisiz bir düzenlemeyi ENGELLEMEZ. Yayındaki (teklifsiz)
     * talebin tek kategorisi gizliyse form kategorisiz açılır; "Değişiklikleri
     * kaydet" yeni talebin "en az 1 kategori" kuralına takılıyor, kapanış
     * tarihi kategori seçmeden uzatılamıyordu. Taslağın yayın kapısı AYNEN durur.
     */
    it("yayındaki talep: tek kategorisi gizliyse kategori seçmeden kaydedilir; alan nedenini söyler", async () => {
      wrap(
        <QuickRequest
          mode="edit"
          listingId="e1"
          listingStatus="OPEN"
          initialValues={{ ...listing(), categoryIds: ["46101500"] }}
        />,
      );
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      expect(screen.queryByRole("button", { name: /Kategori: 46/ })).toBeNull();
      // Alan neden boş (kategorinin adı anılmadan) ve kayıt neden engellenmiyor:
      // TEK not — alanın notu, seçim istemeyen sözle (canlı doğrulama CP-04:
      // "güncel bir kategori seçin" ile "seçmeden de kaydedebilirsiniz" alt alta duruyordu).
      expect(field).toHaveAttribute("data-retired-hint", "true");
      expect(field).toHaveAttribute("data-retired-optional", "true");
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      expect(screen.queryByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeNull();
      expect(screen.queryByText("Yayın için başlık ve kategori gerekli.")).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0].categoryIds).toEqual([]);
      expect(h.update.mock.calls[0][0].asDraft).toBeUndefined();
      expect(screen.queryByText("En az 1 kategori seçmelisiniz")).toBeNull();
      expect(h.publish).not.toHaveBeenCalled();
      await waitFor(() => expect(h.push).toHaveBeenCalledWith("/company/ilan/e1"));
    }, 30_000);

    it("yayındaki talep: güncel API detayı gizli kodu hiç vermez (kategori listesi boş) — kayıt yine engellenmez", async () => {
      // Form, kategorinin kullanımdan kalktığını bilemez (liste zaten boş geldi):
      // "önceki kategori" demez, yalnız kategorisiz kaydedilebildiğini söyler.
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" initialValues={{ ...listing(), categoryIds: [] }} />);
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      expect(field).toHaveAttribute("data-retired-hint", "false");
      expect(screen.getByText("Bu talebin güncel bir kategorisi yok. Kategori seçmeden de kaydedebilirsiniz.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0].categoryIds).toEqual([]);
    }, 30_000);

    it("yayındaki talep: sayfa 'kullanımdan kalkan kategori' bilgisini verirse (retiredCategory) alan notu çizilir — tek not, isteğe bağlı sözle", async () => {
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" retiredCategory initialValues={{ ...listing(), categoryIds: [] }} />);
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      expect(field).toHaveAttribute("data-retired-hint", "true");
      expect(field).toHaveAttribute("data-retired-optional", "true");
      // Formun kendi "kategorisiz kaydedebilirsiniz" notu aynı durumu ikinci kez anlatmaz (CP-04).
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      expect(screen.queryByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeNull();
    }, 30_000);

    it("yayındaki talep: kategorisiz açılan formda güncel kategori seçilirse o gönderilir; notlar kalkar", async () => {
      wrap(
        <QuickRequest
          mode="edit"
          listingId="e1"
          listingStatus="OPEN"
          initialValues={{ ...listing(), categoryIds: ["46101500"] }}
        />,
      );
      fireEvent.click(await screen.findByRole("button", { name: "Kategori seç" }));
      const field = await screen.findByRole("button", { name: "Kategori: 39121600" });
      expect(field).toHaveAttribute("data-retired-hint", "false");
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      expect(screen.getByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeInTheDocument();
      fireEvent.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
      await waitFor(() => expect(h.update).toHaveBeenCalledTimes(1));
      expect(h.update.mock.calls[0][0].categoryIds).toEqual(["39121600"]);
    }, 30_000);

    it("yayındaki talep: GÖRÜNÜR kategorisi varken hepsini kaldırmak değişikliktir — 'kategori zorunlu' durdurur", async () => {
      wrap(<QuickRequest mode="edit" listingId="e1" listingStatus="OPEN" initialValues={listing()} />);
      fireEvent.click(await screen.findByRole("button", { name: "Kategorileri boşalt" }));
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      // Kategoriyi kullanıcı kaldırdı: "kullanılmıyor" / "kategorisiz kaydedilir" notu yok.
      expect(field).toHaveAttribute("data-retired-hint", "false");
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: "Değişiklikleri kaydet" }));
      expect((await screen.findAllByText("En az 1 kategori seçmelisiniz")).length).toBeGreaterThan(0);
      expect(h.update).not.toHaveBeenCalled();
    }, 30_000);

    it("taslak: tek kategorisi gizliyse alan nedenini söyler; kategori ZORUNLU kalır (yayın kapısı aynen)", async () => {
      wrap(
        <QuickRequest
          mode="edit"
          listingId="e1"
          listingStatus="DRAFT"
          initialValues={{ ...listing(), categoryIds: ["46101500"] }}
        />,
      );
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      expect(field).toHaveAttribute("data-retired-hint", "true");
      // Taslakta "kategorisiz kaydedebilirsiniz" denmez: yayın için kategori gerekir.
      expect(field).toHaveAttribute("data-retired-optional", "false");
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      // Alanın altında tek not: genel yardım satırı da çizilmez.
      expect(screen.queryByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeNull();
      expect(screen.getByText("Yayın için başlık ve kategori gerekli.")).toBeInTheDocument();
    }, 30_000);

    /**
     * KOPYA (canlı doğrulama CP-05). `?from=` ile açılan yeni talep ve "Son
     * taleplerden başla" kategori alanını nedensiz boş açıyordu; ikincisi
     * kullanıcı hiçbir şeye dokunmadan kırmızı "En az 1 kategori seçmelisiniz"
     * de basıyordu. Eşleyici tohumu işaretler (`seedHasRetiredCategory`); form
     * düzenlemedeki notun aynısını çizer — yeni talepte kategori ZORUNLU sözle.
     */
    const legacyDetail = (over: Record<string, unknown> = {}) =>
      ({
        id: "t9",
        title: "Endüstriyel iş eldiveni alımı",
        description: null,
        type: "ALIM",
        format: "RFQ",
        status: "OPEN",
        visibility: "PUBLIC",
        targetCountries: [],
        primaryCurrency: "TRY",
        allowedCurrencies: ["TRY"],
        categoryIds: [],
        hasRetiredCategory: true,
        items: [{ id: "i1", name: "İş eldiveni", quantity: "100", unit: "çift", questions: [] }],
        invitations: [],
        ...over,
      }) as never;

    it("kopya (?from=): eski kategorili talebin tohumu — alan notu çizilir, zorunlu sözle; kırmızı hata ve ikinci not yok", async () => {
      wrap(<QuickRequest seedTerms initialValues={mapDetailToForm(legacyDetail(), { forCopy: true })} />);
      const field = await screen.findByRole("button", { name: "Kategori seç" });
      expect(field).toHaveAttribute("data-retired-hint", "true");
      expect(field).toHaveAttribute("data-retired-optional", "false");
      expect(screen.queryByText("En az 1 kategori seçmelisiniz")).toBeNull();
      expect(screen.queryByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeNull();
      expect(screen.queryByText(/Bu talebin güncel bir kategorisi yok/)).toBeNull();
      // Yeni talepte kategori zorunlu kalır.
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      expect((await screen.findAllByText("En az 1 kategori seçmelisiniz")).length).toBeGreaterThan(0);
      expect(h.create).not.toHaveBeenCalled();
    }, 30_000);

    it("kopya: eski kategorisi OLMAYAN kategorisiz talebin tohumu not çizmez (genel yardım satırı durur)", async () => {
      wrap(<QuickRequest seedTerms initialValues={mapDetailToForm(legacyDetail({ hasRetiredCategory: false }), { forCopy: true })} />);
      expect(await screen.findByRole("button", { name: "Kategori seç" })).toHaveAttribute("data-retired-hint", "false");
      expect(screen.getByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeInTheDocument();
    }, 30_000);

    it("'Son taleplerden başla': eski kategorili talep — alan notu çizilir; dokunmadan kırmızı 'en az 1 kategori' ÇIKMAZ; toast 'kategori kopyalandı' DEMEZ", async () => {
      const get = vi.spyOn(companyApi, "get").mockResolvedValue({ data: legacyDetail() });
      const toastSuccess = vi.spyOn(toast, "success");
      try {
        wrap(<QuickRequest />);
        const field = await screen.findByRole("button", { name: "Kategori seç" });
        expect(field).toHaveAttribute("data-retired-hint", "false");
        fireEvent.click(await screen.findByRole("button", { name: "Geçen ayki kablo alımı" }));
        await waitFor(() => expect(screen.getByRole("button", { name: "Kategori seç" })).toHaveAttribute("data-retired-hint", "true"));
        expect(get).toHaveBeenCalledWith("/company/listings/t9");
        expect(screen.getByRole("button", { name: "Kategori seç" })).toHaveAttribute("data-retired-optional", "false");
        expect((screen.getByLabelText(/Talep başlığı/) as HTMLInputElement).value).toBe("Endüstriyel iş eldiveni alımı (2)");
        expect(screen.queryByText("En az 1 kategori seçmelisiniz")).toBeNull();
        expect(screen.queryByText("Eşleştirme ve tedarikçi bildirimi kategoriden çalışır.")).toBeNull();
        // Gözden geçirme R6-06: alan boş ve notu "önceki kategori artık
        // kullanılmıyor" derken toast "Kalemler ve kategori kopyalandı" diyordu —
        // iki mesaj çelişiyordu. Toast yalnız gerçekten kopyalananı söyler.
        expect(toastSuccess.mock.calls.map((c) => c[0])).toEqual(["Kalemler kopyalandı — miktarları kontrol edin"]);
      } finally {
        get.mockRestore();
        toastSuccess.mockRestore();
      }
    }, 30_000);

    it("'Son taleplerden başla': görünür kategorili talep kategorisiyle gelir, not yok; toast kategoriyi de söyler", async () => {
      const get = vi.spyOn(companyApi, "get").mockResolvedValue({ data: legacyDetail({ categoryIds: ["39121600"], hasRetiredCategory: false }) });
      const toastSuccess = vi.spyOn(toast, "success");
      try {
        wrap(<QuickRequest />);
        fireEvent.click(await screen.findByRole("button", { name: "Geçen ayki kablo alımı" }));
        const field = await screen.findByRole("button", { name: "Kategori: 39121600" });
        expect(field).toHaveAttribute("data-retired-hint", "false");
        expect(screen.queryByText("En az 1 kategori seçmelisiniz")).toBeNull();
        expect(toastSuccess.mock.calls.map((c) => c[0])).toEqual(["Kalemler ve kategori kopyalandı — miktarları kontrol edin"]);
      } finally {
        get.mockRestore();
        toastSuccess.mockRestore();
      }
    }, 30_000);

    it("'Son taleplerden başla': bir kategorisi kullanımdan kalkmış, öteki görünür talep — görünür olan kopyalanır, toast kategoriyi söyler", async () => {
      const get = vi.spyOn(companyApi, "get").mockResolvedValue({ data: legacyDetail({ categoryIds: ["39121600"], hasRetiredCategory: true }) });
      const toastSuccess = vi.spyOn(toast, "success");
      try {
        wrap(<QuickRequest />);
        fireEvent.click(await screen.findByRole("button", { name: "Geçen ayki kablo alımı" }));
        expect(await screen.findByRole("button", { name: "Kategori: 39121600" })).toHaveAttribute("data-retired-hint", "false");
        expect(toastSuccess.mock.calls.map((c) => c[0])).toEqual(["Kalemler ve kategori kopyalandı — miktarları kontrol edin"]);
      } finally {
        get.mockRestore();
        toastSuccess.mockRestore();
      }
    }, 30_000);

    it("kopya toast'ı üç dilde: kategorisiz kopyada kategori anılmaz", async () => {
      const { createTranslator } = await import("use-intl/core");
      const { messagesFor, WEB_NAMESPACES } = await import("@rothern/i18n/messages");
      const texts = (["tr", "en", "ru"] as const).map((locale) => {
        const t = createTranslator({
          locale,
          messages: messagesFor(locale, WEB_NAMESPACES),
          namespace: "web.panel.requests.recentRequests" as never,
          onError: (e) => {
            throw e;
          },
        }) as unknown as (key: string) => string;
        return [t("kalemlerKopyalandiMiktarlari"), t("kalemlerVeKategoriKopyalandiMiktarlari")];
      });
      expect(texts).toEqual([
        ["Kalemler kopyalandı — miktarları kontrol edin", "Kalemler ve kategori kopyalandı — miktarları kontrol edin"],
        ["Line items copied — check the quantities", "Line items and category copied — check the quantities"],
        ["Позиции скопированы — проверьте количества", "Позиции и категория скопированы — проверьте количества"],
      ]);
    });

    it("şablon tohumundaki gizli kategori forma girmez; alan nedenini söyler, yeni talepte kategori zorunlu kalır", async () => {
      // Şablon yükü eşleyiciden geçmez: ham kod buraya kadar gelir.
      wrap(<QuickRequest seedTerms initialValues={{ ...listing(), categoryIds: ["10151500"] }} />);
      expect(await screen.findByRole("button", { name: "Kategori seç" })).toHaveAttribute("data-retired-hint", "true");
      fireEvent.click(screen.getAllByRole("button", { name: /Talebi yayınla/ })[0]);
      expect((await screen.findAllByText("En az 1 kategori seçmelisiniz")).length).toBeGreaterThan(0);
      expect(h.create).not.toHaveBeenCalled();
    }, 30_000);

    it("oturum taslağındaki gizli kategori geri yüklenmez (taslak eşleyiciden geçmez)", async () => {
      sessionStorage.setItem(
        "quick-request-draft",
        JSON.stringify({ title: "Eski taslak", description: "", items: [{ ...DEFAULT_FORM_VALUES.items[0]!, name: "eldiven" }], categoryIds: ["46101500"], keywords: [], deliveryAddressId: "", visibility: "PUBLIC", invitedSupplierIds: [], bidsCloseAt: "" }),
      );
      wrap(<QuickRequest />);
      expect(await screen.findByText("Kaldığınız taslak geri yüklendi.")).toBeInTheDocument();
      expect(screen.getByRole("button", { name: "Kategori seç" })).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Kategori: 46/ })).toBeNull();
      // Alan neden boş: taslağın kategorisi kullanımdan kalktı (R-WEB-01).
      expect(screen.getByRole("button", { name: "Kategori seç" })).toHaveAttribute("data-retired-hint", "true");
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
