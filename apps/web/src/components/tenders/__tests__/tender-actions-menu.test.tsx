// @vitest-environment jsdom
/**
 * Talep sahibinin eylem çubuğu + ⋮ menüsü (arayüz testi webB-04):
 *  - O-058 / T-06: tam yetkisi olmayan (doğrulanmamış) firmada yeni iş
 *    eylemleri (davet, AI keşfi, kopyalama, düzenleme, pazarlık/yeni tur) yok;
 *    kilit notu doğrulama gerektiğini söyler ve CTA doğrulama durumunu izler
 *    (başvur / durumu gör / yeniden başvur — hep doğrulama sayfası; ücretsiz
 *    dönem 2026-10-07, paket adı yok). Görüntüleme/kapatma/iptal açık.
 *  - O-025: menüden "Yeni Tur Oluştur" RFQ talepte RFQ ile başlar; taşıma notu
 *    tipe göre (süresiz geçerlilik yalnız pazarlıkta).
 *  - D-249: vazgeçilen önceki denemenin seçimi yeni açılışa taşınmaz.
 *  - D-254: davetli firma pasif + rozet; aramada eşleşme yoksa ayrı metin.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

const { mutation } = vi.hoisted(() => ({
  mutation: () => ({ mutateAsync: () => Promise.resolve(), isPending: false }),
}));
vi.mock("@/hooks/use-company-listings", () => ({
  useAddInvitations: mutation,
  useCancelListing: mutation,
  useChangeClosing: mutation,
  useCloseNoAward: mutation,
  useCreateNextRound: mutation,
  useDeleteListing: mutation,
  useStartEvaluation: mutation,
  useUpdateInternalNotes: mutation,
}));
vi.mock("@/hooks/use-company-connections", () => ({
  useConnections: () => ({
    isLoading: false,
    data: [
      { company: { id: "c1", name: "Alfa Metal", rothernId: "RTH-1" } },
      { company: { id: "c2", name: "Beta Boru", rothernId: "RTH-2" } },
    ],
  }),
}));
vi.mock("@/i18n/navigation", () => ({
  Link: ({ children, href }: { children: ReactNode; href: string }) => <a href={href}>{children}</a>,
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), back: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));
vi.mock("@/components/providers/confirm-dialog", () => ({ useConfirm: () => vi.fn() }));
vi.mock("@/components/tenders/supplier-discovery-modal", () => ({ SupplierDiscoveryModal: () => null }));
vi.mock("@/components/tenders/round-history-dialog", () => ({ RoundHistoryDialog: () => null }));
vi.mock("@/components/catalyst/dropdown", () => ({
  Dropdown: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownButton: () => null,
  DropdownMenu: ({ children }: { children: ReactNode }) => <div>{children}</div>,
  DropdownDivider: () => null,
  DropdownLabel: ({ children }: { children: ReactNode }) => <span>{children}</span>,
  DropdownItem: ({ children, onClick, href }: { children: ReactNode; onClick?: () => void; href?: string }) =>
    href ? (
      <a href={href}>{children}</a>
    ) : (
      <button type="button" onClick={onClick}>
        {children}
      </button>
    ),
}));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { TenderActionsMenu } from "../tender-actions-menu";

/** Kilit notunun bağlantısı doğrulama durumunu `/me` deposundan okur. */
function setVerification(companyVerificationStatus: string) {
  useCompanyAuthStore.setState({ company: { companyVerificationStatus } as never } as never);
}
afterEach(() => useCompanyAuthStore.setState({ company: null } as never));

const VERIFY = "/company/ayarlar/dogrulama";
const LOCK_NOTE = /Firmanız henüz doğrulanmadı.*firma doğrulaması gerektirir/;

const base = {
  id: "l1",
  format: "RFQ",
  closesAt: "2030-01-01T10:00:00.000Z",
  internalNotes: null,
};

describe("TenderActionsMenu — doğrulama kilidi (T-06)", () => {
  it("yetkisiz firmada (inceleme sürüyor) yeni iş eylemleri yok, kapatma/iptal açık; CTA doğrulama durumuna", () => {
    setVerification("PENDING");
    render(<TenderActionsMenu {...base} status="OPEN" canEdit buyLock="upgrade" />);
    for (const label of [
      "Tedarikçi Davet Et",
      "AI ile Daha Fazla Eriş",
      "Satın Alma Talebini Kopyala",
      "Pazarlığa Geç",
      "Satın Alma Talebini Düzenle",
    ]) {
      expect(screen.queryByText(label)).toBeNull();
    }
    expect(screen.getByText("İç Notlar")).toBeInTheDocument();
    expect(screen.getByText("Satın Alma Talebini İptal Et")).toBeInTheDocument();
    expect(screen.getByText("Kapanış Zamanını Değiştir")).toBeInTheDocument();
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(LOCK_NOTE);
    expect(note).not.toHaveTextContent(/Silver|Gold|Platinum|paket/i);
    expect(within(note).getByRole("link", { name: "Doğrulama durumunu gör" })).toHaveAttribute("href", VERIFY);
  });

  it("kilitli firmada kapanış diyaloğu 'ileri alabilirsiniz' demez; yalnız öne çekme notu (api1-01 yeniden doğrulama)", async () => {
    render(<TenderActionsMenu {...base} status="OPEN" buyLock="upgrade" />);
    fireEvent.click(screen.getByRole("button", { name: "Kapanış Zamanını Değiştir" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent("Yeni kapanış tarih/saatini seçin.");
    expect(dialog).not.toHaveTextContent(/İleri alabilir/);
    expect(dialog).toHaveTextContent(/yalnız öne çekebilirsiniz/);
  });

  it("tam yetkili firmada kapanış diyaloğu ileri/öne çekmeye izin verdiğini söyler", async () => {
    render(<TenderActionsMenu {...base} status="OPEN" />);
    fireEvent.click(screen.getByRole("button", { name: "Kapanış Zamanını Değiştir" }));
    const dialog = await screen.findByRole("dialog");
    expect(dialog).toHaveTextContent(/İleri alabilir veya öne çekebilirsiniz/);
    expect(dialog).not.toHaveTextContent(/yalnız öne çekebilirsiniz/);
  });

  it("doğrulanmamış firmada CTA doğrulama başvurusu; reddedilmişte yeniden başvuru", () => {
    setVerification("UNVERIFIED");
    const first = render(<TenderActionsMenu {...base} status="OPEN" buyLock="verify" />);
    const link = within(screen.getByRole("note")).getByRole("link", { name: "Firmanızı doğrulayın" });
    expect(link).toHaveAttribute("href", VERIFY);
    // Doğrulanmamış firmada kazandırma da kapalı (API assertVerified):
    // not "kazandırma açık kalır" demez, doğrulama gerektiğini söyler.
    const note = screen.getByRole("note");
    expect(note).toHaveTextContent(/kazandırmak firma doğrulaması gerektirir/);
    expect(note).toHaveTextContent(/Görüntüleme, değerlendirme, kapatma ve iptal açık kalır/);
    expect(note).not.toHaveTextContent(/kazandırma, kapatma/);
    first.unmount();

    setVerification("REJECTED");
    render(<TenderActionsMenu {...base} status="OPEN" buyLock="verify" />);
    expect(within(screen.getByRole("note")).getByRole("link", { name: "Yeniden başvurun" })).toHaveAttribute(
      "href",
      VERIFY,
    );
  });

  it.each(["AWARDED", "CANCELLED"])(
    "%s (bitmiş) talepte kilitli eylem yok, kilit notu çıkmaz",
    (status) => {
      render(<TenderActionsMenu {...base} status={status} buyLock="upgrade" />);
      expect(screen.queryByRole("note")).toBeNull();
    },
  );

  it.each(["DRAFT", "IN_AWARD", "CLOSED_NO_AWARD"])(
    "%s talepte kilit notu çıkar",
    (status) => {
      render(<TenderActionsMenu {...base} status={status} buyLock="upgrade" />);
      expect(screen.getByRole("note")).toHaveTextContent(LOCK_NOTE);
    },
  );

  it("tam yetkili firmada eylemler açık, kilit notu yok", () => {
    render(<TenderActionsMenu {...base} status="OPEN" canEdit />);
    expect(screen.getByText("Tedarikçi Davet Et")).toBeInTheDocument();
    expect(screen.getByText("Satın Alma Talebini Kopyala")).toBeInTheDocument();
    expect(screen.getByText("Pazarlığa Geç")).toBeInTheDocument();
    expect(screen.queryByRole("note")).toBeNull();
  });
});

describe("TenderActionsMenu — yeni tur diyaloğu", () => {
  it("RFQ talepte menüden açılış RFQ ile başlar; not RFQ geçerliliğini anlatır", async () => {
    render(<TenderActionsMenu {...base} status="IN_AWARD" />);
    fireEvent.click(screen.getByRole("button", { name: "Yeni Tur Oluştur" }));
    const dialog = await screen.findByRole("dialog");
    expect(within(dialog).getByText("Teklif Toplama (Kapalı Zarf)")).toBeInTheDocument();
    expect(dialog).toHaveTextContent(/geçerlilik süresi korunur/);
    expect(dialog).not.toHaveTextContent(/süresiz geçerli/);
    expect(dialog).not.toHaveTextContent(/Pazarlık kuralları/);
  });

  it("vazgeçilen denemenin eleme seçimi sonraki açılışa taşınmaz (D-249)", async () => {
    render(<TenderActionsMenu {...base} status="IN_AWARD" />);
    fireEvent.click(screen.getByRole("button", { name: "Pazarlığa Geç" }));
    let dialog = await screen.findByRole("dialog");
    const box = within(dialog).getByRole("checkbox", { name: /teklif vermeyen tedarikçileri ele/ });
    fireEvent.click(box);
    expect(box).toBeChecked();
    fireEvent.click(within(dialog).getByRole("button", { name: "Vazgeç" }));
    fireEvent.click(screen.getByRole("button", { name: "Yeni Tur Oluştur" }));
    dialog = await screen.findByRole("dialog", { name: "Yeni Tur Oluştur" });
    expect(within(dialog).getByRole("checkbox", { name: /teklif vermeyen tedarikçileri ele/ })).not.toBeChecked();
  });
});

describe("TenderActionsMenu — davet diyaloğu (D-254)", () => {
  it("davetli firma seçilemez ve rozetlidir; eşleşmeyen aramada ayrı metin", async () => {
    render(<TenderActionsMenu {...base} status="OPEN" invitedCodes={["RTH-1"]} />);
    fireEvent.click(screen.getByRole("button", { name: "Tedarikçi Davet Et" }));
    const dialog = await screen.findByRole("dialog");
    const invited = within(dialog).getByText("Alfa Metal").closest("label")!;
    expect(within(invited).getByRole("checkbox")).toBeDisabled();
    expect(within(invited).getByText("Davetli")).toBeInTheDocument();
    expect(within(within(dialog).getByText("Beta Boru").closest("label")!).getByRole("checkbox")).toBeEnabled();
    fireEvent.change(within(dialog).getByPlaceholderText("Firma ara…"), { target: { value: "zzzz" } });
    expect(within(dialog).getByText("Eşleşen firma yok.")).toBeInTheDocument();
    expect(within(dialog).queryByText("Bağlı firma yok.")).toBeNull();
  });
});
