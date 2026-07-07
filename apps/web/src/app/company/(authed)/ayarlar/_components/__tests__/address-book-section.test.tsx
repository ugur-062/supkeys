// @vitest-environment jsdom
import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  addresses: [] as unknown[],
  loading: false,
  save: vi.fn(),
  del: vi.fn(),
  confirm: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn(), info: vi.fn() },
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn(), prefetch: vi.fn() }),
}));
vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => h.confirm,
}));
vi.mock("@/hooks/use-company-addresses", () => ({
  useAddresses: () => ({ data: h.addresses, isLoading: h.loading }),
  useSaveAddress: () => ({ mutateAsync: h.save, isPending: false }),
  useDeleteAddress: () => ({ mutateAsync: h.del, isPending: false }),
}));

import { AddressBookSection } from "../address-book-section";

function addr(over: Record<string, unknown> = {}) {
  return {
    id: "a1",
    type: "TESLIMAT",
    title: "Merkez Depo",
    contactName: "Ada",
    phone: null,
    country: "TR",
    city: "İstanbul",
    district: "Kadıköy",
    addressLine: "Örnek Sk. No 1",
    postalCode: null,
    taxOffice: null,
    taxNumber: null,
    isDefault: false,
    ...over,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  h.loading = false;
  h.addresses = [];
});

describe("AddressBookSection", () => {
  it("boş durumda 'Henüz kayıtlı adres yok' gösterir", () => {
    render(<AddressBookSection canManage />);
    expect(screen.getByText("Henüz kayıtlı adres yok.")).toBeInTheDocument();
  });

  it("adres listesi: başlık, tip rozeti, açık adres", () => {
    h.addresses = [addr()];
    render(<AddressBookSection canManage />);
    expect(screen.getByText("Merkez Depo")).toBeInTheDocument();
    expect(screen.getByText("Teslimat")).toBeInTheDocument();
    expect(screen.getByText(/Örnek Sk\. No 1/)).toBeInTheDocument();
  });

  it("canManage=false: 'Adres Ekle' ve düzenle/sil gizli", () => {
    h.addresses = [addr()];
    render(<AddressBookSection canManage={false} />);
    expect(
      screen.queryByRole("button", { name: "Adres Ekle" }),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByRole("button", { name: "Düzenle" }),
    ).not.toBeInTheDocument();
  });

  it("'Adres Ekle' → yeni adres dialogu açılır", async () => {
    const user = userEvent.setup();
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    expect(await screen.findByText("Yeni Adres")).toBeInTheDocument();
  });

  it("yeni adres: başlık/açık adres boşken doğrulama hatası, save çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    await screen.findByText("Yeni Adres");
    await user.click(screen.getByRole("button", { name: "Ekle" }));
    expect(h.toast.error).toHaveBeenCalledWith("Başlık ve açık adres zorunlu");
    expect(h.save).not.toHaveBeenCalled();
  });

  it("yeni adres: geçerli veri → useSaveAddress + başarı toast'ı", async () => {
    const user = userEvent.setup();
    h.save.mockResolvedValue({});
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    await screen.findByText("Yeni Adres");

    await user.type(screen.getByLabelText("Başlık"), "Şube");
    await user.type(screen.getByLabelText("Açık adres"), "Deneme Cd. 5");
    await user.click(screen.getByRole("button", { name: "Ekle" }));

    expect(h.save).toHaveBeenCalledTimes(1);
    const payload = h.save.mock.calls[0][0];
    expect(payload.title).toBe("Şube");
    expect(payload.addressLine).toBe("Deneme Cd. 5");
    expect(payload.type).toBe("TESLIMAT");
    expect(h.toast.success).toHaveBeenCalledWith("Adres eklendi");
  });

  it("mevcut adres düzenle: dialog ön-dolu gelir", async () => {
    const user = userEvent.setup();
    h.addresses = [addr()];
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Düzenle" }));
    expect(await screen.findByText("Adresi Düzenle")).toBeInTheDocument();
    expect(screen.getByLabelText("Başlık")).toHaveValue("Merkez Depo");
  });

  it("sil: onay verilince useDeleteAddress çağrılır", async () => {
    const user = userEvent.setup();
    h.addresses = [addr()];
    h.confirm.mockResolvedValue(true);
    h.del.mockResolvedValue({});
    render(<AddressBookSection canManage />);

    // Kart içindeki ikinci (çöp kutusu) plain buton — erişilebilir adı boş.
    const card = screen.getByText("Merkez Depo").closest("div")!
      .parentElement!.parentElement as HTMLElement;
    const trash = within(card)
      .getAllByRole("button")
      .find((b) => b.textContent === "")!;
    await user.click(trash);

    expect(h.confirm).toHaveBeenCalled();
    // confirm async çözüldükten sonra silme çağrılır.
    await vi.waitFor(() => expect(h.del).toHaveBeenCalledWith("a1"));
  });
});
