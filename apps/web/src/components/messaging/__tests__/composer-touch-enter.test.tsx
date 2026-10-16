// @vitest-environment jsdom
/**
 * MOBİL DENETİM g04 (kullanıcı kararı): dokunmatik cihazda (`(pointer: coarse)`)
 * ekran klavyesinin Enter'ı mesajı GÖNDERMEZ — yeni satır açar, gönderim yalnız
 * Gönder düğmesiyle. Masaüstü değişmedi: Enter gönderir, Shift+Enter yeni satır.
 * Aynı kural bilgi talebi yanıt kutusunda: dokunmatikte Ctrl+Enter kısayolu ve
 * "Ctrl+Enter ile gönder" ipucu yok.
 */
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  send: vi.fn(async (content: string) => {
    void content;
  }),
}));

vi.mock("@/hooks/use-company-messages", () => ({
  useThreadMessages: () => ({ data: { messages: [] }, isLoading: false }),
  useSendMessage: () => ({ mutateAsync: (content: string) => h.send(content), isPending: false }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: { roles: ["SATIN_ALMACI"] },
    company: { tier: "GOLD", companyVerificationStatus: "VERIFIED" },
  }),
}));

import { CompanyMessageThread } from "../company-message-thread";
import { enterSendsMessage, modEnterSendsReply } from "../use-coarse-pointer";

const originalMatchMedia = window.matchMedia;
/** `(pointer: coarse)` sorgusunu verilen değerle yanıtlayan matchMedia. */
function setCoarse(coarse: boolean) {
  window.matchMedia = ((query: string) => ({
    matches: query === "(pointer: coarse)" ? coarse : false,
    media: query,
    onchange: null,
    addEventListener() {},
    removeEventListener() {},
    addListener() {},
    removeListener() {},
    dispatchEvent: () => false,
  })) as unknown as typeof window.matchMedia;
}

beforeEach(() => {
  h.send.mockClear();
  window.HTMLElement.prototype.scrollIntoView = vi.fn();
});
afterEach(() => {
  window.matchMedia = originalMatchMedia;
});

const renderThread = () =>
  render(<CompanyMessageThread portal="satinalma" otherPartyId="c2" otherPartyName="Karşı Firma" />);

describe("Mesaj kutusu — Enter kuralı", () => {
  it("dokunmatik: Enter GÖNDERMEZ (yeni satır kalır), dönüş tuşu 'enter', kısayol ipucu yok; Gönder düğmesi gönderir", () => {
    setCoarse(true);
    renderThread();
    const box = screen.getByRole("textbox");
    expect(box).toHaveAttribute("enterkeyhint", "enter");
    expect(box).not.toHaveAttribute("aria-describedby");
    expect(screen.queryByText(/Shift\+Enter/)).not.toBeInTheDocument();

    fireEvent.change(box, { target: { value: "satır 1" } });
    const enter = fireEvent.keyDown(box, { key: "Enter" });
    // Varsayılan engellenmedi → tarayıcı yeni satırı ekler.
    expect(enter).toBe(true);
    expect(h.send).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(h.send).toHaveBeenCalledWith("satır 1");
  });

  it("masaüstü (ince işaretçi): Enter gönderir, Shift+Enter göndermez; ipucu ve 'send' dönüş tuşu", () => {
    setCoarse(false);
    renderThread();
    const box = screen.getByRole("textbox");
    expect(box).toHaveAttribute("enterkeyhint", "send");
    expect(box).toHaveAttribute("aria-describedby", "company-message-enter-hint");
    expect(screen.getByText("Enter: gönder, Shift+Enter: yeni satır")).toBeInTheDocument();

    fireEvent.change(box, { target: { value: "Merhaba" } });
    expect(fireEvent.keyDown(box, { key: "Enter", shiftKey: true })).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    expect(fireEvent.keyDown(box, { key: "Enter" })).toBe(false);
    expect(h.send).toHaveBeenCalledWith("Merhaba");
  });

  it("Gönder düğmesi telefonda 44 px dokunma alanı taşır (sm+ eski boy)", () => {
    setCoarse(true);
    renderThread();
    const cls = screen.getByRole("button", { name: "Gönder" }).className;
    expect(cls).toMatch(/(^|\s)h-11(\s|$)/);
    expect(cls).toMatch(/(^|\s)sm:h-9(\s|$)/);
  });
});

describe("Klavye kuralı yardımcıları", () => {
  const ev = (init: Partial<{ key: string; shiftKey: boolean; ctrlKey: boolean; metaKey: boolean; keyCode: number; isComposing: boolean }>) =>
    ({
      key: init.key ?? "Enter",
      shiftKey: !!init.shiftKey,
      ctrlKey: !!init.ctrlKey,
      metaKey: !!init.metaKey,
      keyCode: init.keyCode ?? 13,
      nativeEvent: { isComposing: !!init.isComposing },
    }) as unknown as React.KeyboardEvent<HTMLElement>;

  it("enterSendsMessage: masaüstünde düz Enter; IME bileşimi ve dokunmatikte hayır", () => {
    setCoarse(false);
    expect(enterSendsMessage(ev({}))).toBe(true);
    expect(enterSendsMessage(ev({ shiftKey: true }))).toBe(false);
    expect(enterSendsMessage(ev({ isComposing: true }))).toBe(false);
    expect(enterSendsMessage(ev({ keyCode: 229 }))).toBe(false);
    expect(enterSendsMessage(ev({ key: "a" }))).toBe(false);
    setCoarse(true);
    expect(enterSendsMessage(ev({}))).toBe(false);
  });

  it("modEnterSendsReply: masaüstünde Ctrl/⌘+Enter; düz Enter ve dokunmatikte hayır", () => {
    setCoarse(false);
    expect(modEnterSendsReply(ev({ ctrlKey: true }))).toBe(true);
    expect(modEnterSendsReply(ev({ metaKey: true }))).toBe(true);
    expect(modEnterSendsReply(ev({}))).toBe(false);
    expect(modEnterSendsReply(ev({ ctrlKey: true, isComposing: true }))).toBe(false);
    setCoarse(true);
    expect(modEnterSendsReply(ev({ ctrlKey: true }))).toBe(false);
  });
});
