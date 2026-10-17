// @vitest-environment jsdom
/**
 * Banka Hesapları (2026-09-10): liste + IBAN denetimi backend ile BİREBİR
 * (TR katı, yabancı mod-97) + satır içi hata + geçerli kayıt.
 */
import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  accounts: [] as unknown[],
  save: vi.fn(),
  del: vi.fn(),
  toast: { success: vi.fn(), error: vi.fn() },
}));

vi.mock("sonner", () => ({ toast: h.toast }));
vi.mock("@/components/providers/confirm-dialog", () => ({
  useConfirm: () => async () => true,
}));
vi.mock("@/hooks/use-company-bank-accounts", () => ({
  useBankAccounts: () => ({ data: h.accounts, isLoading: false, isError: false, refetch: vi.fn() }),
  useSaveBankAccount: () => ({ mutateAsync: h.save, isPending: false }),
  useDeleteBankAccount: () => ({ mutateAsync: h.del, isPending: false }),
}));

import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { BankAccountsSection } from "../bank-accounts-section";

// Gerçek geçerli IBAN'lar (mod-97 tutar).
const TR_OK = "TR330006100519786457841326";
const DE_OK = "DE89370400440532013000";

/**
 * Kurulum alanını TEK `paste` olayıyla doldurur (son toparlama 2026-10-04).
 * Karakter karakter `user.type` her tuşta açık diyaloğu (banka ülkesi seçicisi
 * dahil) yeniden çizdiriyordu; tam suite paralel koşarken uzun IBAN + SWIFT +
 * banka adı yazımı testi 15 sn zaman aşımına itiyordu. Doğrulama değere
 * bakar; tuş-tuş yazım diğer IBAN testlerinde `user.type` ile sınanır.
 */
async function fill(user: ReturnType<typeof userEvent.setup>, el: HTMLElement, text: string) {
  await user.click(el);
  await user.paste(text);
}

describe("BankAccountsSection", () => {
  beforeEach(() => {
    useCompanyAuthStore.setState({ company: null } as never);
    h.save.mockReset().mockResolvedValue({});
    h.toast.success.mockReset();
    h.toast.error.mockReset();
    h.accounts = [
      { id: "b1", title: "TL Vadesiz", accountHolder: "Demo A.Ş.", iban: TR_OK, bankName: "İş Bankası", isDefault: true },
    ];
  });

  it("liste: başlık, sahibi, varsayılan rozeti; IBAN maskeli", () => {
    render(<BankAccountsSection canManage />);
    expect(screen.getByText("TL Vadesiz")).toBeInTheDocument();
    expect(screen.getByText(/Demo A\.Ş\./)).toBeInTheDocument();
    expect(screen.getByText("Varsayılan")).toBeInTheDocument();
    expect(screen.queryByText(TR_OK)).not.toBeInTheDocument();
  });

  // Mobil denetim g11 (doğrulama turu): örtük ızgara sütunu en geniş kartın
  // min-content'ine büyüyüp 360 px'te kartları bölümün sağ dolgusuna
  // taşırıyordu; başlığın truncate'i devreye girmiyordu.
  it("kart ızgarası telefonda tek minmax(0,1fr) sütun; kart min-w-0, başlık kırpılır", () => {
    render(<BankAccountsSection canManage />);
    const title = screen.getByText("TL Vadesiz");
    expect(title.className.split(/\s+/)).toEqual(expect.arrayContaining(["min-w-0", "truncate"]));
    const card = title.closest<HTMLElement>(".rounded-lg")!;
    expect(card.className.split(/\s+/)).toContain("min-w-0");
    const grid = card.parentElement!;
    expect(grid.className.split(/\s+/)).toEqual(expect.arrayContaining(["grid", "grid-cols-1", "sm:grid-cols-2"]));
  });

  async function openNew() {
    const user = userEvent.setup();
    render(<BankAccountsSection canManage />);
    await user.click(screen.getByRole("button", { name: "Hesap Ekle" }));
    await screen.findByText("Yeni Banka Hesabı");
    await fill(user, screen.getByLabelText("Hesap Başlığı *"), "EUR");
    await fill(user, screen.getByLabelText("Hesap Sahibi *"), "Demo A.Ş.");
    return user;
  }

  it("TR IBAN kontrol hanesi tutmuyorsa satır içi hata, kayıt yok", async () => {
    const user = await openNew();
    await user.type(screen.getByLabelText("IBAN *"), "TR330006100519786457841327");
    expect(await screen.findByText(/Geçerli bir TR IBAN/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).not.toHaveBeenCalled();
  });

  it("yabancı IBAN da mod-97'den geçer (backend ile aynı); bozuksa hata", async () => {
    const user = await openNew();
    await user.type(screen.getByLabelText("IBAN *"), "DE89370400440532013001");
    expect(await screen.findByText(/kontrol hanesi tutmuyor/)).toBeInTheDocument();
    await user.clear(screen.getByLabelText("IBAN *"));
    await user.type(screen.getByLabelText("IBAN *"), DE_OK);
    expect(screen.queryByText(/kontrol hanesi tutmuyor/)).not.toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).toHaveBeenCalledWith(expect.objectContaining({ iban: DE_OK, title: "EUR" }));
    expect(h.toast.success).toHaveBeenCalledWith("Hesap eklendi");
  });

  it("IBAN ülkesinde yer tutucu ülke önekli ve kayıtlı uzunlukta", async () => {
    await openNew();
    expect(screen.getByLabelText("IBAN *")).toHaveAttribute("placeholder", "TR00 0000 0000 0000 0000 0000 00");
  });

  it("kısmi IBAN ülkesi (BR): yerel hesap no + SWIFT + banka adı YA DA IBAN (2026-09-27)", async () => {
    useCompanyAuthStore.setState({ company: { country: "BR" } } as never);
    const user = await openNew();
    expect(screen.getByText(/IBAN ya da yerel hesap numarası/)).toBeInTheDocument();
    const field = screen.getByLabelText("IBAN ya da hesap numarası *");
    // Yerel hesap no → SWIFT ve banka adı zorunlu.
    await user.type(field, "0001 12345-6");
    expect(screen.getByLabelText("SWIFT / BIC kodu *")).toBeInTheDocument();
    expect(screen.getByLabelText("Banka adı *")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("SWIFT / BIC kodu *"), "BRASBRRJ");
    await user.type(screen.getByLabelText("Banka adı *"), "Banco do Brasil");
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ bankCountry: "BR", accountNumber: "0001 12345-6", swiftBic: "BRASBRRJ" }),
    );
  });

  it("kısmi IBAN ülkesinde geçerli IBAN yazılırsa IBAN gider, SWIFT/banka adı isteğe bağlı", async () => {
    useCompanyAuthStore.setState({ company: { country: "BR" } } as never);
    const user = await openNew();
    await user.type(screen.getByLabelText("IBAN ya da hesap numarası *"), "BR18 0036 0305 0000 1000 9795 493C 1");
    expect(screen.getByLabelText("SWIFT / BIC kodu (isteğe bağlı)")).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).toHaveBeenCalledWith(
      expect.objectContaining({ bankCountry: "BR", iban: "BR1800360305000010009795493C1" }),
    );
  });

  it("kısmi IBAN ülkesinde yanlış yazılmış IBAN hesap no sayılmaz: satır içi IBAN hatası, kayıt yok (derin denetim LU-10)", async () => {
    useCompanyAuthStore.setState({ company: { country: "BR" } } as never);
    const user = await openNew();
    await fill(user, screen.getByLabelText("IBAN ya da hesap numarası *"), "BR18 0036 0305 0000 1000 9795 494C 1");
    await fill(user, screen.getByLabelText("SWIFT / BIC kodu *"), "BRASBRRJ");
    await fill(user, screen.getByLabelText("Banka adı *"), "Banco do Brasil");
    expect(await screen.findByText(/kontrol hanesi tutmuyor/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("yaptırım ülkesi: IR IBAN'ı ve İran SWIFT'i satır içi hata, kayıt yok (derin denetim MU-17)", async () => {
    const user = await openNew();
    // Banka ülkesi TR iken mod-97'si tutan İran IBAN'ı.
    await user.type(screen.getByLabelText("IBAN *"), "IR270170000000100324200001");
    expect(await screen.findByText(/kayda kapalı bir ülkedeki bankaya ait/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).not.toHaveBeenCalled();
    await user.clear(screen.getByLabelText("IBAN *"));
    await user.type(screen.getByLabelText("IBAN *"), TR_OK);
    await user.type(screen.getByLabelText("SWIFT / BIC kodu (isteğe bağlı)"), "MELIIRTH");
    expect(await screen.findByText(/kayda kapalı bir ülkedeki bankaya ait/)).toBeInTheDocument();
    await user.click(screen.getByRole("button", { name: "Kaydet" }));
    expect(h.save).not.toHaveBeenCalled();
    expect(h.save).not.toHaveBeenCalled();
  });

  it("canManage=false: Hesap Ekle yok, Kurucu notu var", () => {
    render(<BankAccountsSection canManage={false} />);
    expect(screen.queryByRole("button", { name: "Hesap Ekle" })).not.toBeInTheDocument();
    expect(screen.getByText(/yalnız Kurucu/)).toBeInTheDocument();
  });
  it("zorunlu alan boşken Kaydet tıklanabilir; her boş alanın altında neden yazar (D-308)", async () => {
    const user = userEvent.setup();
    render(<BankAccountsSection canManage />);
    await user.click(screen.getByRole("button", { name: "Hesap Ekle" }));
    await screen.findByText("Yeni Banka Hesabı");
    const save = screen.getByRole("button", { name: "Kaydet" });
    expect(save).toBeEnabled();
    expect(screen.queryByText("Bu alan zorunlu")).not.toBeInTheDocument();
    await user.click(save);
    // Başlık, hesap sahibi, IBAN.
    expect(await screen.findAllByText("Bu alan zorunlu")).toHaveLength(3);
    expect(h.save).not.toHaveBeenCalled();
    await user.type(screen.getByLabelText("Hesap Başlığı *"), "TL");
    await user.type(screen.getByLabelText("Hesap Sahibi *"), "Demo A.Ş.");
    await user.type(screen.getByLabelText("IBAN *"), TR_OK);
    expect(screen.queryByText("Bu alan zorunlu")).not.toBeInTheDocument();
    // Enter formu gönderir (D-307).
    await user.type(screen.getByLabelText("IBAN *"), "{Enter}");
    await vi.waitFor(() => expect(h.save).toHaveBeenCalledTimes(1));
  });

  it("varsayılan onay kutusu yazısına tıklamak kutuyu işaretler (O-120 kalıbı)", async () => {
    const user = userEvent.setup();
    render(<BankAccountsSection canManage />);
    await user.click(screen.getByRole("button", { name: "Hesap Ekle" }));
    await screen.findByText("Yeni Banka Hesabı");
    const box = screen.getByRole("checkbox");
    expect(box).not.toBeChecked();
    await user.click(screen.getByText(/Varsayılan hesap/));
    expect(box).toBeChecked();
  });

  // Mobil denetim 2026-10 g11 (adres penceresiyle aynı kural): Kaydet'te hata
  // ekranın dışında kalmasın; pencere telefonda ekrana sığar, eylemler sabit.
  it("Kaydet'te ilk hatalı alana (Hesap Başlığı) odak + kaydırma; telefonda pencere ekrana sığar", async () => {
    const scrollSpy = vi.fn();
    Element.prototype.scrollIntoView = scrollSpy;
    try {
      const user = userEvent.setup();
      render(<BankAccountsSection canManage />);
      await user.click(screen.getByRole("button", { name: "Hesap Ekle" }));
      await screen.findByText("Yeni Banka Hesabı");
      const dialog = screen.getByRole("dialog");
      const panel = dialog.querySelector<HTMLElement>('[class*="100dvh"]');
      expect(panel!.className.split(/\s+/)).toEqual(expect.arrayContaining(["max-sm:flex", "max-sm:flex-col"]));
      const save = screen.getByRole("button", { name: "Kaydet" });
      expect(save.parentElement!.className.split(/\s+/)).toContain("max-sm:shrink-0");
      await user.click(save);
      await waitFor(() => expect(screen.getByLabelText("Hesap Başlığı *")).toHaveFocus());
      expect(scrollSpy).toHaveBeenCalled();
      expect(h.save).not.toHaveBeenCalled();
    } finally {
      delete (Element.prototype as Partial<Element>).scrollIntoView;
    }
  });
});
