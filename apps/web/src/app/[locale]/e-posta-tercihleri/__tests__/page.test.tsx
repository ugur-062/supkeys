// @vitest-environment jsdom
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import Page from "../page";

/**
 * TEK TIK ÇIKIŞ SAYFASI (2026-09-27): açılış HİÇBİR ŞEY DEĞİŞTİRMEZ (güvenlik
 * tarayıcıları bağlantıyı açar) — çıkış düğmeyle; "tüm isteğe bağlı" seçeneği;
 * geçersiz jeton; zaten çıkmış adres.
 */
const h = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), params: new URLSearchParams("t=TOKEN123") }));
vi.mock("@/lib/api", () => ({ api: { get: h.get, post: h.post } }));
vi.mock("next/navigation", () => ({ useSearchParams: () => h.params }));

beforeEach(() => {
  h.get.mockReset();
  h.post.mockReset();
  h.params = new URLSearchParams("t=TOKEN123");
});

describe("E-posta tercihleri sayfası", () => {
  it("açılışta yalnız OKUR; düğmeyle çıkar", async () => {
    h.get.mockResolvedValue({ data: { scope: "categoryMatch", email: "ay•••@firma.com", locale: "tr", unsubscribed: false } });
    h.post.mockResolvedValue({ data: { scope: "categoryMatch" } });
    render(<Page />);
    expect(await screen.findByText("Adres: ay•••@firma.com")).toBeInTheDocument();
    expect(screen.getByText("kategorinize uyan yeni talepler")).toBeInTheDocument();
    expect(h.post).not.toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Abonelikten çık" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/public/email/unsubscribe", { t: "TOKEN123", all: false }));
    expect(await screen.findByText("Abonelikten çıktınız")).toBeInTheDocument();
  });

  it("'tüm isteğe bağlı e-postalar' seçeneği", async () => {
    h.get.mockResolvedValue({ data: { scope: "invite", email: "in•••@x.de", locale: "tr", unsubscribed: false } });
    h.post.mockResolvedValue({ data: { scope: "all" } });
    render(<Page />);
    fireEvent.click(await screen.findByRole("button", { name: "Tüm isteğe bağlı e-postalardan çık" }));
    await waitFor(() => expect(h.post).toHaveBeenCalledWith("/public/email/unsubscribe", { t: "TOKEN123", all: true }));
  });

  it("zaten çıkmış adres doğrudan sonuç; geçersiz jeton hata kartı", async () => {
    h.get.mockResolvedValue({ data: { scope: "reminder", email: "a•••@b.com", locale: "tr", unsubscribed: true } });
    const { unmount } = render(<Page />);
    expect(await screen.findByText("Abonelikten çıktınız")).toBeInTheDocument();
    unmount();
    h.get.mockRejectedValue(new Error("400"));
    render(<Page />);
    expect(await screen.findByText("Bağlantı geçersiz")).toBeInTheDocument();
  });
});
