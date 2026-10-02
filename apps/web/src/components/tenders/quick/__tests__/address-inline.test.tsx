// @vitest-environment jsdom
/**
 * Satır içi adres kaydı hatası tek toast: sunucu nedeni varsa global toast'la
 * aynı metin basılır (tekilleştirici yutar), yoksa genel metin (arayüz testi
 * FX-00 yeniden doğrulama — "Adres kaydedilemedi" + neden iki toast çıkıyordu).
 */
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { AxiosError, AxiosHeaders } from "axios";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  mutateAsync: vi.fn(),
  toastError: vi.fn(),
  toastSuccess: vi.fn(),
}));

vi.mock("@/hooks/use-company-addresses", () => ({
  useSaveAddress: () => ({ mutateAsync: h.mutateAsync, isPending: false }),
}));
vi.mock("@/lib/company-auth/store", () => ({
  useCompanyAuthStore: (sel: (s: unknown) => unknown) => sel({ company: { country: "TR" } }),
}));
vi.mock("sonner", () => ({ toast: { error: h.toastError, success: h.toastSuccess } }));

import { AddressInline } from "../address-inline";

function apiError(status: number, message: string) {
  const headers = new AxiosHeaders();
  return new AxiosError(message, "ERR_BAD_REQUEST", { headers }, null, {
    status,
    statusText: "",
    headers: {},
    config: { headers },
    data: { message },
  });
}

beforeEach(() => vi.clearAllMocks());

describe("AddressInline", () => {
  it("sunucu reddinde nedenini tek toast olarak gösterir (genel metin eklenmez)", async () => {
    const user = userEvent.setup();
    const reason = "Bir firma en fazla 200 adres kaydedebilir";
    h.mutateAsync.mockRejectedValue(apiError(400, reason));
    render(<AddressInline onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("Açık adres"), "Organize Sanayi 1. Cadde");
    await user.click(screen.getByRole("button", { name: "Adresi kaydet" }));
    expect(h.toastError).toHaveBeenCalledTimes(1);
    expect(h.toastError).toHaveBeenCalledWith(reason);
  });

  it("nedeni olmayan hatada genel metin", async () => {
    const user = userEvent.setup();
    h.mutateAsync.mockRejectedValue(new Error(""));
    render(<AddressInline onCreated={vi.fn()} onCancel={vi.fn()} />);
    await user.type(screen.getByLabelText("Açık adres"), "Organize Sanayi 1. Cadde");
    await user.click(screen.getByRole("button", { name: "Adresi kaydet" }));
    expect(h.toastError).toHaveBeenCalledWith("Adres kaydedilemedi");
  });
});
