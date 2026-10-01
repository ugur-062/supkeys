// @vitest-environment jsdom
/**
 * Talep sahibinin eylem çubuğu + ⋮ menüsü (arayüz testi webB-04):
 *  - O-058 / T-06: Gold'u düşen firmada yeni iş eylemleri (davet, AI keşfi,
 *    kopyalama, düzenleme, pazarlık/yeni tur) yok; kilit notu doğru CTA'yı
 *    verir (doğrulanmamış → doğrulama, değilse Gold). Sonuçlandırma açık.
 *  - O-025: menüden "Yeni Tur Oluştur" RFQ talepte RFQ ile başlar; taşıma notu
 *    tipe göre (süresiz geçerlilik yalnız pazarlıkta).
 *  - D-249: vazgeçilen önceki denemenin seçimi yeni açılışa taşınmaz.
 *  - D-254: davetli firma pasif + rozet; aramada eşleşme yoksa ayrı metin.
 */
import { fireEvent, render, screen, within } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

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

import { TenderActionsMenu } from "../tender-actions-menu";

const base = {
  id: "l1",
  format: "RFQ",
  closesAt: "2030-01-01T10:00:00.000Z",
  internalNotes: null,
};

describe("TenderActionsMenu — paket kilidi (T-06)", () => {
  it("Gold değilse yeni iş eylemleri yok, sonuçlandırma açık; CTA Gold'a", () => {
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
    expect(note).toHaveTextContent(/Gold paket gerektirir/);
    expect(within(note).getByRole("link")).toHaveAttribute("href", "/company/premium");
  });

  it("doğrulanmamış firmada CTA önce doğrulama", () => {
    render(<TenderActionsMenu {...base} status="OPEN" buyLock="verify" />);
    const link = within(screen.getByRole("note")).getByRole("link", { name: "Önce ücretsiz doğrulan" });
    expect(link).toHaveAttribute("href", "/company/ayarlar/dogrulama");
  });

  it("Gold'da eylemler açık, kilit notu yok", () => {
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
