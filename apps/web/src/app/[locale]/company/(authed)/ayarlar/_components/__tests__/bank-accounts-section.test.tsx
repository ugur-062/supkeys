// @vitest-environment jsdom
/**
 * Banka Hesapları (2026-09-10): liste + IBAN denetimi backend ile BİREBİR
 * (TR katı, yabancı mod-97) + satır içi hata + geçerli kayıt.
 */
import { render, screen } from "@testing-library/react";
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

import { BankAccountsSection } from "../bank-accounts-section";

// Gerçek geçerli IBAN'lar (mod-97 tutar).
const TR_OK = "TR330006100519786457841326";
const DE_OK = "DE89370400440532013000";

describe("BankAccountsSection", () => {
  beforeEach(() => {
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

  async function openNew() {
    const user = userEvent.setup();
    render(<BankAccountsSection canManage />);
    await user.click(screen.getByRole("button", { name: "Hesap Ekle" }));
    await screen.findByText("Yeni Banka Hesabı");
    await user.type(screen.getByLabelText("Hesap Başlığı *"), "EUR");
    await user.type(screen.getByLabelText("Hesap Sahibi *"), "Demo A.Ş.");
    return user;
  }

  it("TR IBAN kontrol hanesi tutmuyorsa satır içi hata, Kaydet pasif", async () => {
    const user = await openNew();
    await user.type(screen.getByLabelText("IBAN *"), "TR330006100519786457841327");
    expect(await screen.findByText(/Geçerli bir TR IBAN/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Kaydet" })).toBeDisabled();
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

  it("canManage=false: Hesap Ekle yok, Kurucu notu var", () => {
    render(<BankAccountsSection canManage={false} />);
    expect(screen.queryByRole("button", { name: "Hesap Ekle" })).not.toBeInTheDocument();
    expect(screen.getByText(/yalnız Kurucu/)).toBeInTheDocument();
  });
});
