// @vitest-environment jsdom
/**
 * AI tedarikçi keşfi → "Davet E-postası Gönder" sözleşmesi (2026-09-27):
 *  - YAYIN ÖNCESİ (talep yok, `onCollect` verildi): e-posta HEMEN GİTMEZ —
 *    seçilen adresler forma eklenir; genel "Rothern'e katıl" daveti
 *    (`invite-by-email/batch`) artık hiç çağrılmaz.
 *  - Kayıtlı talepte: talebe özel davet ucu; adres başına GERÇEK sonuç
 *    satırda görünür (gönderilemeyen "Gönderildi" diye işaretlenmez).
 *  - Web araması talebin görünürlük ülkeleriyle çağrılır.
 *  - DAVET DİLİ satır başına: varsayılanı firmanın ülkesinden (`DE` → English),
 *    yoksa e-posta uzantısı, yoksa arayüz dili; kullanıcı değiştirebilir ve
 *    seçim (adres + dil + ülke) taslağa/API'ye taşınır. Ülke şehrin yanında.
 */
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  external: vi.fn(),
  sendExternal: vi.fn(),
  discovery: vi.fn(),
  inviteMembers: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn(), warning: vi.fn() },
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/hooks/use-company-connections", () => ({
  useInviteConnection: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useListingDetail: () => ({ data: undefined }),
}));
vi.mock("@/hooks/use-supplier-discovery", () => ({
  useSupplierDiscovery: () => ({ mutateAsync: h.discovery, isPending: false }),
  useExternalSupplierDiscovery: () => ({ mutateAsync: h.external, isPending: false }),
  useExternalTenderInvite: () => ({ mutateAsync: h.sendExternal, isPending: false }),
  useInviteDiscoveredMembers: () => ({ mutateAsync: h.inviteMembers, isPending: false }),
}));

import { SupplierDiscoveryModal } from "../supplier-discovery-modal";

beforeEach(() => {
  h.discovery.mockReset().mockResolvedValue([]);
  h.external.mockReset().mockResolvedValue([
    { name: "Baret A.Ş.", city: "İzmir", country: "TR", website: null, email: "info@baret.com", reason: "Üretici" },
    { name: "Kask Ltd.", city: null, website: null, email: "satis@kask.com", reason: "Bayi" },
  ]);
  h.sendExternal.mockReset();
  Object.values(h.toast).forEach((f) => f.mockReset());
});

async function searchWeb() {
  fireEvent.click(screen.getByRole("tab", { name: /Web'de Ara/ }));
  fireEvent.click(screen.getByRole("button", { name: "Web'de Ara" }));
  await screen.findByText("Baret A.Ş.");
}

describe("SupplierDiscoveryModal — dış davet", () => {
  it("yayın öncesi: seçilen adres forma eklenir, e-posta GİTMEZ; arama hedef ülkelerle", async () => {
    const onCollect = vi.fn();
    render(
      <SupplierDiscoveryModal
        isOpen
        onClose={() => {}}
        categoryIds={["39121600"]}
        itemNames={["Baret"]}
        targetCountries={["DE"]}
        onCollect={onCollect}
      />,
    );
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ targetCountries: ["DE"] });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Talebe ekle (1)" }));
    expect(onCollect).toHaveBeenCalledWith([{ email: "info@baret.com", locale: "tr", country: "TR" }]);
    expect(h.sendExternal).not.toHaveBeenCalled();
  });

  it("kayıtlı talep: talebe özel davet; gönderilemeyen adres 'Gönderildi' işaretlenmez", async () => {
    h.sendExternal.mockResolvedValue([
      { email: "info@baret.com", status: "SENT" },
      { email: "satis@kask.com", status: "SUPPRESSED", reason: "Adres e-posta almıyor" },
    ]);
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    await searchWeb();
    expect(h.external.mock.calls[0][0]).toMatchObject({ listingId: "l1" });
    fireEvent.click(screen.getByLabelText("Baret A.Ş. seç"));
    fireEvent.click(screen.getByLabelText("Kask Ltd. seç"));
    fireEvent.click(screen.getByRole("button", { name: "Davet E-postası Gönder (2)" }));
    await waitFor(() =>
      expect(h.sendExternal).toHaveBeenCalledWith({
        listingId: "l1",
        invites: [
          { email: "info@baret.com", locale: "tr", country: "TR" },
          { email: "satis@kask.com", locale: "tr", country: null },
        ],
        source: "AI_FORM",
      }),
    );
    expect(await screen.findByText("Gönderildi")).toBeInTheDocument();
    expect(screen.getByText("Adres e-posta almıyor")).toBeInTheDocument();
    expect(h.toast.warning).toHaveBeenCalledWith("satis@kask.com: Adres e-posta almıyor");
  });

  it("davet dili: ülkeden varsayılan (DE → English, .kz → Русский), ülke şehrin yanında, satırda değiştirilebilir", async () => {
    h.external.mockResolvedValue([
      { name: "Rohr GmbH", city: "Munich", country: "DE", website: "rohr.de", email: "info@rohr.de", reason: "Hersteller" },
      { name: "Truby TOO", city: null, country: null, website: null, email: "sales@truby.kz", reason: "Дилер" },
    ]);
    const onCollect = vi.fn();
    render(
      <SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} onCollect={onCollect} />,
    );
    fireEvent.click(screen.getByRole("tab", { name: /Web'de Ara/ }));
    fireEvent.click(screen.getByRole("button", { name: "Web'de Ara" }));
    await screen.findByText("Rohr GmbH");
    expect(screen.getByText("Munich, Almanya")).toBeInTheDocument();
    const rohrLang = screen.getByLabelText("Rohr GmbH için davet dili") as HTMLSelectElement;
    const trubyLang = screen.getByLabelText("Truby TOO için davet dili") as HTMLSelectElement;
    expect(rohrLang.value).toBe("en");
    expect(trubyLang.value).toBe("ru");
    // Kullanıcı Alman firmaya Rusça göndermeyi seçer.
    fireEvent.change(rohrLang, { target: { value: "ru" } });
    fireEvent.click(screen.getByLabelText("Rohr GmbH seç"));
    fireEvent.click(screen.getByLabelText("Truby TOO seç"));
    fireEvent.click(screen.getByRole("button", { name: "Talebe ekle (2)" }));
    expect(onCollect).toHaveBeenCalledWith([
      { email: "info@rohr.de", locale: "ru", country: "DE" },
      { email: "sales@truby.kz", locale: "ru", country: null },
    ]);
  });

  it("kayıtlı talep, Platformda sekmesi: üye DOĞRUDAN talebe davet edilir (bağlantı daveti değil); davetli olan kilitli", async () => {
    h.discovery.mockResolvedValue([
      { companyId: "co1", name: "Bağlantı AŞ", city: "Bursa", rothernId: "R1", matchedCategories: ["Cıvatalar"], strongMatch: true, matchedItems: [], connectionStatus: "NONE", alreadyInvited: false },
      { companyId: "co2", name: "Somun Ltd", city: null, rothernId: "R2", matchedCategories: [], strongMatch: false, matchedItems: [], connectionStatus: "NONE", alreadyInvited: true },
    ]);
    h.inviteMembers.mockReset().mockResolvedValue([{ companyId: "co1", status: "INVITED" }]);
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    await screen.findByText("Bağlantı AŞ");
    expect(screen.getByText("Talebe davetli")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "Talebe davet et" }));
    await waitFor(() => expect(h.inviteMembers).toHaveBeenCalledWith({ listingId: "l1", companyIds: ["co1"] }));
    expect(h.toast.success).toHaveBeenCalledWith("1 Rothern üyesi talebe davet edildi");
    expect(await screen.findAllByText("Talebe davetli")).toHaveLength(2);
  });
});

describe("SupplierDiscoveryModal — hata ve talep kipi metinleri (arayüz testi O-058, D-098)", () => {
  it("öneri çağrısı reddedilince (403 doğrulama kilidi) boş durum değil sunucunun nedeni görünür", async () => {
    h.discovery.mockRejectedValue({
      isAxiosError: true,
      response: { status: 403, data: { message: "AI tedarikçi keşfi firma doğrulaması gerektirir" } },
    });
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("firma doğrulaması gerektirir");
    expect(screen.queryByText("Bu kategorilerde önerilebilecek yeni firma bulunamadı.")).toBeNull();
  });

  it("403 TIER_REQUIRED: hata + doğrulama CTA'sı; davet akışını anlatan altbilgi yok (webB-04 yeniden doğrulama)", async () => {
    h.discovery.mockRejectedValue({
      isAxiosError: true,
      response: {
        status: 403,
        data: { message: "Bu özellik firma doğrulaması gerektirir.", code: "TIER_REQUIRED" },
      },
    });
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    expect(await screen.findByRole("alert")).toHaveTextContent("firma doğrulaması gerektirir");
    // Tek eylem doğrulama akışı; paket sayfası yok (ücretsiz dönem 2026-10-07).
    expect(screen.getByRole("link", { name: "Firmanızı doğrulayın" })).toHaveAttribute(
      "href",
      "/company/ayarlar/dogrulama",
    );
    expect(document.querySelector('a[href*="/company/premium"]')).toBeNull();
    expect(screen.queryByText(/doğrudan talebinize davet edilir/)).toBeNull();
  });

  it("kilit dışı hata: CTA yok, altbilgi yine gizli; başarıda altbilgi görünür", async () => {
    h.discovery.mockRejectedValueOnce({ isAxiosError: true, response: { status: 500, data: {} } });
    const { rerender } = render(
      <SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />,
    );
    expect(await screen.findByRole("alert")).toHaveTextContent("Öneriler yüklenemedi");
    expect(screen.queryByRole("link", { name: "Firmanızı doğrulayın" })).toBeNull();
    expect(document.querySelector('a[href="/company/ayarlar/dogrulama"]')).toBeNull();
    expect(screen.queryByText(/doğrudan talebinize davet edilir/)).toBeNull();
    rerender(<SupplierDiscoveryModal isOpen={false} onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    rerender(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    expect(await screen.findByText(/doğrudan talebinize davet edilir/)).toBeInTheDocument();
  });

  it("talepten açılışta giriş ve altbilgi bağlantı akışını anlatmaz", async () => {
    render(<SupplierDiscoveryModal isOpen onClose={() => {}} categoryIds={["39121600"]} listingId="l1" />);
    expect(screen.getByText(/Platformdaki üyeleri doğrudan talebe davet edin/)).toBeInTheDocument();
    expect(screen.queryByText(/kabul edince satın alma talebinize davet edebilirsiniz/)).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: /Web'de Ara/ }));
    expect(screen.getByText(/bu talebe özel davet e-postası gider/)).toBeInTheDocument();
    expect(screen.queryByText(/firma bağlantılarınıza eklenir/)).toBeNull();
  });
});
