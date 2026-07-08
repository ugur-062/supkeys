// @vitest-environment jsdom
import type { CompanyBankAccount } from "@/hooks/use-company-bank-accounts";
import { todayLocalISO } from "@/lib/tenders/date";
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

  it("teslim tarihi min'i YEREL bugüne eşit; boşken onay kapalı", () => {
    h.bankAccounts = { data: [account] };
    render(
      <AcceptOrderModal
        open
        onClose={vi.fn()}
        onSubmit={vi.fn()}
        pending={false}
      />,
    );
    const dateInput = screen.getByLabelText("Tahmini Teslim Tarihi *");
    expect(dateInput).toHaveAttribute("min", todayLocalISO());
    // UTC slice değil yerel takvim → min "bugün" formatı YYYY-MM-DD.
    expect(dateInput.getAttribute("min")).toMatch(/^\d{4}-\d{2}-\d{2}$/);
    expect(screen.getByRole("button", { name: "Onayla" })).toBeDisabled();
  });

  it("tarih girilince onay aktif → payload teslim tarihi + varsayılan hesabı taşır", async () => {
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
    const date = new Date(Date.now() + 4 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await userEvent.type(
      screen.getByLabelText("Tahmini Teslim Tarihi *"),
      date,
    );
    const confirm = screen.getByRole("button", { name: "Onayla" });
    expect(confirm).toBeEnabled();
    await userEvent.click(confirm);

    expect(onSubmit).toHaveBeenCalledWith(
      expect.objectContaining({
        expectedDeliveryDate: date,
        // Varsayılan hesap otomatik seçilir (elle IBAN yok).
        bankAccountId: "acc1",
      }),
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
    const date = new Date(Date.now() + 2 * 86_400_000)
      .toISOString()
      .slice(0, 10);
    await userEvent.type(
      screen.getByLabelText("Tahmini Teslim Tarihi *"),
      date,
    );
    // Hesap yokken tarih girilse de onay KAPALI (ödeme alınamaz).
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
    const confirm = screen.getByRole("button", { name: "Siparişi Gönder" });
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
      screen.getByRole("button", { name: "Siparişi Gönder" }),
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
