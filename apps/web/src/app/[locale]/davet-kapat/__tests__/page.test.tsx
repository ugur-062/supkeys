// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "../page";

/**
 * DAVET KAPATMA SAYFASI (derin denetim MU-17): açılış HİÇBİR ŞEY YAZMAZ
 * (kurumsal güvenlik tarayıcıları bağlantıyı açar) — çıkış düğmeyle POST;
 * zaten çıkmış adres; geçersiz jeton.
 */
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), params: new URLSearchParams("token=TOK1") }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.params }));

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.params = new URLSearchParams("token=TOK1");
});

describe("Davet kapatma sayfası", () => {
  it("açılışta yalnız OKUR; çıkış düğmeyle POST", async () => {
    h.get.mockResolvedValue({ data: { email: "sa•••@firma.com", optedOut: false } });
    h.post.mockResolvedValue({ data: { ok: true } });
    render(<Page />);
    expect(await screen.findByText("Adres: sa•••@firma.com")).toBeInTheDocument();
    expect(h.get).toHaveBeenCalledWith("/public/referral-optout", { params: { token: "TOK1" }, skipErrorToast: true });
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Davet almak istemiyorum" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/public/referral-optout", { token: "TOK1" }, { skipErrorToast: true }));
    expect(await screen.findByText("Davetler kapatıldı")).toBeInTheDocument();
  });

  it("POST hata verirse uyarı; sayfa açık kalır", async () => {
    h.get.mockResolvedValue({ data: { email: "sa•••@firma.com", optedOut: false } });
    h.post.mockRejectedValue(new Error("500"));
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Davet almak istemiyorum" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Davet almak istemiyorum" })).toBeInTheDocument();
  });

  it("zaten çıkmış adres doğrudan sonuç; geçersiz ya da eksik jeton hata kartı", async () => {
    h.get.mockResolvedValue({ data: { email: "a•••@b.com", optedOut: true } });
    const { unmount } = render(<Page />);
    expect(await screen.findByText("Davetler kapatıldı")).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
    unmount();
    h.get.mockRejectedValue(new Error("404"));
    const second = render(<Page />);
    expect(await screen.findByText("Bağlantı geçersiz")).toBeInTheDocument();
    second.unmount();
    h.get.mockReset();
    h.params = new URLSearchParams("");
    render(<Page />);
    expect(await screen.findByText("Bağlantı geçersiz")).toBeInTheDocument();
    expect(h.get).not.toHaveBeenCalled();
  });
});
