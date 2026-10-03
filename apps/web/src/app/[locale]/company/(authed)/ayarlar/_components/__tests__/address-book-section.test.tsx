// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
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

// Ülke seçici: gerçek combobox yerine ülkeyi doğrudan değiştiren düğme.
vi.mock("@/components/ui/country-combobox", () => ({
  CountryCombobox: ({ onChange }: { onChange: (c: string) => void }) => (
    <button type="button" onClick={() => onChange("DE")}>
      set-country-DE
    </button>
  ),
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
    expect(screen.getByText(/Henüz kayıtlı adres yok/)).toBeInTheDocument();
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

  it("yeni adres: başlık/açık adres boşken SATIR İÇİ hata (toast değil), save çağrılmaz", async () => {
    const user = userEvent.setup();
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    await screen.findByText("Yeni Adres");
    await user.click(screen.getByRole("button", { name: "Ekle" }));
    expect(await screen.findByText("Başlık zorunlu")).toBeInTheDocument();
    expect(screen.getByText("Açık adres zorunlu")).toBeInTheDocument();
    expect(h.toast.error).not.toHaveBeenCalled();
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

  it("TR adresi yabancı ülkeye geçince gizlenen İlçe değeri temizlenir (kayda sızmaz)", async () => {
    const user = userEvent.setup();
    h.addresses = [addr({ district: "Kadıköy" })];
    h.save.mockResolvedValue({});
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Düzenle" }));
    await screen.findByText("Adresi Düzenle");
    await user.click(screen.getByRole("button", { name: "set-country-DE" }));
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).toHaveBeenCalledTimes(1);
    const payload = h.save.mock.calls[0][0];
    expect(payload.country).toBe("DE");
    expect(payload.district).toBe("");
  });

  it("sil: onay verilince useDeleteAddress çağrılır", async () => {
    const user = userEvent.setup();
    h.addresses = [addr()];
    h.confirm.mockResolvedValue(true);
    h.del.mockResolvedValue({});
    render(<AddressBookSection canManage />);

    // C36 sonrası aksiyonlar erişilebilir adlı ikon butonlar.
    await user.click(screen.getByRole("button", { name: "Sil" }));

    expect(h.confirm).toHaveBeenCalled();
    // confirm async çözüldükten sonra silme çağrılır.
    await vi.waitFor(() => expect(h.del).toHaveBeenCalledWith("a1"));
  });
  it("TR posta kodu yalnız rakam ve 5 hane; eksikse satır içi hata, kayıt yok (D-133)", async () => {
    const user = userEvent.setup();
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    await screen.findByText("Yeni Adres");
    await user.type(screen.getByLabelText("Başlık"), "Şube");
    await user.type(screen.getByLabelText("Açık adres"), "Deneme Cd. 5");
    const postal = screen.getByLabelText("Posta kodu");
    await user.type(postal, "AB34C0");
    expect(postal).toHaveValue("340");
    await user.click(screen.getByRole("button", { name: "Ekle" }));
    expect(await screen.findByText(/posta kodu 5 haneli/)).toBeInTheDocument();
    expect(h.save).not.toHaveBeenCalled();
    await user.type(postal, "00");
    // Enter formu gönderir (D-307).
    await user.type(screen.getByLabelText("Başlık"), "{Enter}");
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
    expect(h.save.mock.calls[0][0].postalCode).toBe("34000");
  });

  it("alanlarda DTO tavanı maxLength olarak var (D-307)", async () => {
    const user = userEvent.setup();
    render(<AddressBookSection canManage />);
    await user.click(screen.getByRole("button", { name: "Adres Ekle" }));
    await screen.findByText("Yeni Adres");
    expect(screen.getByLabelText("Başlık")).toHaveAttribute("maxLength", "120");
    expect(screen.getByLabelText("Açık adres")).toHaveAttribute("maxLength", "500");
  });

  it("yabancı fatura adresinde 'VD: —' yok, yalnız vergi no (D-137)", () => {
    h.addresses = [addr({ type: "FATURA", country: "DE", taxNumber: "DE123456789", taxOffice: null })];
    render(<AddressBookSection canManage />);
    expect(screen.getByText("Vergi no: DE123456789")).toBeInTheDocument();
    expect(screen.queryByText(/VD:/)).not.toBeInTheDocument();
  });

  it("çok adreste arama ve sayfalı liste (D-135)", async () => {
    const user = userEvent.setup();
    h.addresses = Array.from({ length: 45 }, (_, i) =>
      addr({ id: `a${i}`, title: `Depo ${i}`, city: i === 7 ? "Ankara" : "İstanbul" }),
    );
    render(<AddressBookSection canManage />);
    expect(screen.getAllByText(/^Depo \d+$/)).toHaveLength(20);
    await user.click(screen.getByRole("button", { name: /Daha fazla göster \(25 kaldı\)/ }));
    expect(screen.getAllByText(/^Depo \d+$/)).toHaveLength(40);
    await user.type(screen.getByRole("searchbox", { name: "Adreslerde ara" }), "ankara");
    expect(screen.getAllByText(/^Depo \d+$/)).toHaveLength(1);
    expect(screen.getByText("Depo 7")).toBeInTheDocument();
    await user.type(screen.getByRole("searchbox", { name: "Adreslerde ara" }), "zzz");
    expect(screen.getByText("Aramanızla eşleşen adres yok.")).toBeInTheDocument();
  });

  it("adres tavanı doluyken 'Adres Ekle' baştan kapalı ve nedeni yazılı; düzenle açık kalır (webC-09)", async () => {
    const user = userEvent.setup();
    h.addresses = Array.from({ length: 200 }, (_, i) => addr({ id: `a${i}`, title: `Depo ${i}` }));
    render(<AddressBookSection canManage />);
    const add = screen.getByRole("button", { name: "Adres Ekle" });
    expect(add).toBeDisabled();
    const note = screen.getByText(/en fazla 200 adres kaydedebilir/);
    expect(add).toHaveAttribute("aria-describedby", note.id);
    await user.click(screen.getAllByRole("button", { name: "Düzenle" })[0]!);
    expect(await screen.findByRole("dialog")).toBeInTheDocument();
  });

  it("tavanın altında 'Adres Ekle' açık, not yok", () => {
    h.addresses = Array.from({ length: 199 }, (_, i) => addr({ id: `a${i}`, title: `Depo ${i}` }));
    render(<AddressBookSection canManage />);
    expect(screen.getByRole("button", { name: "Adres Ekle" })).toBeEnabled();
    expect(screen.queryByText(/en fazla 200 adres/)).not.toBeInTheDocument();
  });
});
