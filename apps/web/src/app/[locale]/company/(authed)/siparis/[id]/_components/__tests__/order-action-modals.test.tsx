// @vitest-environment jsdom
import type { CompanyBankAccount } from "@/hooks/use-company-bank-accounts";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  bankAccounts: { data: undefined as CompanyBankAccount[] | undefined },
}));

vi.mock("@/hooks/use-company-bank-accounts", () => ({
  useBankAccounts: () => h.bankAccounts,
}));

import {
  AcceptOrderModal,
  NoteModal,
  ReasonModal,
  ShipOrderModal,
} from "../order-action-modals";

beforeEach(() => {
  vi.clearAllMocks();
  h.bankAccounts = { data: undefined };
});

describe("AcceptOrderModal", () => {
  const account: CompanyBankAccount = {
    id: "acc1",
    title: "Ana Hesap",
    accountHolder: "Firma A.Ş.",
    iban: "TR000011112222333344",
    bankName: "Demo Bank",
    isDefault: true,
  };

  it("tarih alanı YOK (teslim tekliften gelir); hesap varken onay açık → payload yalnız hesap+not", async () => {
    const onSubmit = vi.fn();
    h.bankAccounts = { data: [account] };
    render(
      <AcceptOrderModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    // Kabulde tekrar tarih sorulmaz (2026-08-02).
    expect(
      screen.queryByLabelText(/Tahmini Teslim Tarihi/),
    ).not.toBeInTheDocument();
    const confirm = screen.getByRole("button", { name: "Onayla" });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        // Varsayılan hesap otomatik seçilir (elle IBAN yok).
        bankAccountId: "acc1",
      }),
    );
    expect(onSubmit.mock.calls[0][0]).not.toHaveProperty(
      "expectedDeliveryDate",
    );
  });

  it("kayıtlı hesap yoksa uyarı gösterir ve onay KAPALI (banka hesabı zorunlu)", async () => {
    const onSubmit = vi.fn();
    h.bankAccounts = { data: [] };
    render(
      <AcceptOrderModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    expect(
      screen.getByText(/banka hesabı gerekli/i),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
    await userEvent.click(screen.getByRole("button", { name: "Onayla" }));
    expect(onSubmit).not.toHaveBeenCalled();
  });
});

describe("ShipOrderModal", () => {
  it("fatura no zorunlu → boşken kapalı; girilince onay ve payload", async () => {
    const onSubmit = vi.fn();
    render(
      <ShipOrderModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Siparişi Tamamla" });
    expect(confirm).toBeDisabled();

    await userEvent.type(
      screen.getByLabelText("Fatura Numarası *"),
      "FTR-2026-42",
    );
    await userEvent.type(
      screen.getByLabelText("Gönderim Notu (opsiyonel)"),
      "Aras Kargo 123",
    );
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith({
      invoiceNumber: "FTR-2026-42",
      deliveryNote: "Aras Kargo 123",
    });
  });

  it("not boşsa deliveryNote undefined kalır", async () => {
    const onSubmit = vi.fn();
    render(
      <ShipOrderModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Fatura Numarası *"),
      "FTR-1",
    );
    await userEvent.click(
      screen.getByRole("button", { name: "Siparişi Tamamla" }),
    );
    expect(onSubmit).toHaveBeenCalledWith({
      invoiceNumber: "FTR-1",
      deliveryNote: undefined,
    });
  });
});

describe("ReasonModal (ret/iptal)", () => {
  it("minLength altında onay kapalı; üstünde açık + trimli gönderir", async () => {
    const onSubmit = vi.fn();
    render(
      <ReasonModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        title="Siparişi Reddet"
        description="Red gerekçesi alıcıya iletilir."
        confirmLabel="Siparişi Reddet"
        minLength={10}
      />,
    );
    const confirm = screen.getByRole("button", { name: "Siparişi Reddet" });
    const box = screen.getByLabelText("Gerekçe *");
    expect(confirm).toBeDisabled();

    await userEvent.type(box, "kısa"); // < 10
    expect(confirm).toBeDisabled();

    await userEvent.clear(box);
    await userEvent.type(box, "  yeterli gerekçe metni  ");
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith("yeterli gerekçe metni");
  });
});

describe("NoteModal (teslim al/tamamla)", () => {
  it("not opsiyonel → boşken bile onaylanır, undefined gönderir", async () => {
    const onSubmit = vi.fn();
    render(
      <NoteModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        title="Teslim Aldım"
        description="Sipariş teslim alındı olarak işaretleniyor."
        confirmLabel="Teslim Aldım"
      />,
    );
    const confirm = screen.getByRole("button", { name: "Teslim Aldım" });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);
    expect(onSubmit).toHaveBeenCalledWith(undefined);
  });

  it("not girilince trimli değer gönderir", async () => {
    const onSubmit = vi.fn();
    render(
      <NoteModal
        open
        onClose={vi.fn()}
        onSubmit={onSubmit}
        pending={false}
        title="Siparişi Tamamla"
        description="Sipariş tamamlanıyor."
        confirmLabel="Tamamla"
      />,
    );
    await userEvent.type(
      screen.getByLabelText("Notunuz (opsiyonel)"),
      "  teşekkürler  ",
    );
    await userEvent.click(screen.getByRole("button", { name: "Tamamla" }));
    expect(onSubmit).toHaveBeenCalledWith("teşekkürler");
  });

  it("pending iken onay kapalı (çift gönderim engeli)", () => {
    render(
      <NoteModal
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        pending
        title="Teslim Aldım"
        description="…"
        confirmLabel="Teslim Aldım"
      />,
    );
    expect(
      screen.getByRole("button", { name: "Teslim Aldım" }),
    ).toBeDisabled();
  });
});
