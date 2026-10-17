// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * MOBİL DENETİM 2026-10 (g04, kullanıcı kararı) — asistan paneli telefonda:
 *  · dokunmatik cihazda (`(pointer: coarse)`) ekran klavyesinin Enter'ı
 *    mesajı GÖNDERMEZ (yeni satır açar); gönderim yalnız Gönder düğmesiyle.
 *    Masaüstünde Enter gönderir, Shift+Enter göndermez (bugünkü gibi).
 *  · başlık 'Rothern …'e inmesin diye "Yeni sohbet" telefonda yalnız simge;
 *    ad ekran okuyucuda kalır.
 */
const h = vi.hoisted(() => ({ send: vi.fn() }));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
  usePathname: () => "/company/satinalma",
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({ company: { tier: "GOLD" }, user: { firstName: "A", lastName: "B" } }),
}));
vi.mock("@/hooks/use-ai-usage", () => ({
  useAiUsage: () => ({ data: { enabled: true, percentUsed: 0, warning: false } }),
}));
vi.mock("@/hooks/use-ai-assistant", () => ({
  useAssistantSessions: () => ({ data: [] }),
  useAssistantSession: () => ({ data: undefined, isFetching: false }),
  useSendAssistantMessage: () => ({ isPending: false, mutateAsync: h.send }),
  useDeleteAssistantSession: () => ({ isPending: false, mutateAsync: vi.fn() }),
  useAssistantAction: () => ({ isPending: false, mutateAsync: vi.fn() }),
}));

import { AssistantPanel } from "../assistant-panel";

Element.prototype.scrollIntoView = vi.fn();

const realMatchMedia = window.matchMedia;
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

const composer = () => screen.getByPlaceholderText(/Bir şey sorun/) as HTMLTextAreaElement;

beforeEach(() => {
  h.send.mockReset();
  h.send.mockResolvedValue({ sessionId: "S", reply: "Tamam", toolsUsed: [], suggestNewChat: false });
});
afterEach(() => {
  window.matchMedia = realMatchMedia;
});

describe("AssistantPanel — Enter tuşu (mobil denetim g04)", () => {
  it("dokunmatik cihazda Enter göndermez; Gönder düğmesi gönderir; klavye ipucu 'enter'", () => {
    setCoarse(true);
    render(<AssistantPanel />);
    fireEvent.change(composer(), { target: { value: "Birinci satır" } });
    const enter = fireEvent.keyDown(composer(), { key: "Enter" });
    // Varsayılan engellenmez → tarayıcı yeni satır ekler.
    expect(enter).toBe(true);
    expect(h.send).not.toHaveBeenCalled();
    expect(composer()).toHaveAttribute("enterkeyhint", "enter");

    fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
    expect(h.send).toHaveBeenCalledTimes(1);
    expect(h.send.mock.calls[0]![0]).toMatchObject({ message: "Birinci satır" });
  });

  it("masaüstünde Enter gönderir, Shift+Enter göndermez; klavye ipucu 'send'", () => {
    setCoarse(false);
    render(<AssistantPanel />);
    fireEvent.change(composer(), { target: { value: "Soru" } });
    expect(composer()).toHaveAttribute("enterkeyhint", "send");

    fireEvent.keyDown(composer(), { key: "Enter", shiftKey: true });
    expect(h.send).not.toHaveBeenCalled();

    const enter = fireEvent.keyDown(composer(), { key: "Enter" });
    expect(enter).toBe(false); // varsayılan engellendi — yeni satır yok
    expect(h.send).toHaveBeenCalledTimes(1);
  });

  it("IME bileşimindeki Enter göndermez (aday onayı)", () => {
    setCoarse(false);
    render(<AssistantPanel />);
    fireEvent.change(composer(), { target: { value: "にほん" } });
    fireEvent.keyDown(composer(), { key: "Enter", keyCode: 229 });
    expect(h.send).not.toHaveBeenCalled();
  });
});

describe("AssistantPanel — başlık (mobil denetim g04 assistant-title-truncated)", () => {
  it("'Yeni sohbet' telefonda yalnız simge (32 px), ad ekran okuyucuda; sm'de yazılı hap", () => {
    render(<AssistantPanel onClose={vi.fn()} />);
    const newChat = screen.getByRole("button", { name: "Yeni sohbet" });
    expect(newChat).toHaveClass("size-8", "sm:size-auto", "sm:px-2.5", "sm:py-1.5");
    expect(screen.getByText("Yeni sohbet")).toHaveClass("sr-only", "sm:not-sr-only");
    // Başlık yine tam ad (kırpma yalnız taşmada).
    expect(screen.getAllByText("Rothern Asistanı")[0]).toHaveClass("truncate");
  });
});
