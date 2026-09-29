// @vitest-environment jsdom
import { act, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim S071 — asistan panelinin sohbet akışı:
 *  · yanıt beklerken sohbet değişirse geç yanıt YENİ sohbete düşmez
 *  · onay isteği hata verirse kart "İptal edildi" DEMEZ (sunucu aksiyonu
 *    yürütmeden önce tüketir; sonuç bilinmez)
 *  · sohbet silme sonucu beklenir; aktif sohbet yalnız başarıda temizlenir
 *  · geçmişten yükleme arka plan tazelemesi bitmeden yazılmaz
 */
type Deferred<T> = { promise: Promise<T>; resolve: (v: T) => void; reject: (e: unknown) => void };
function deferred<T>(): Deferred<T> {
  let resolve!: (v: T) => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<T>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const h = vi.hoisted(() => ({
  send: vi.fn(),
  action: vi.fn(),
  del: vi.fn(),
  sessions: [] as unknown[],
  loaded: { data: undefined as unknown, isFetching: false },
}));

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
  useAssistantSessions: () => ({ data: h.sessions }),
  useAssistantSession: (id: string | null) => (id ? h.loaded : { data: undefined, isFetching: false }),
  useSendAssistantMessage: () => ({ isPending: false, mutateAsync: h.send }),
  useDeleteAssistantSession: () => ({ isPending: false, mutateAsync: h.del }),
  useAssistantAction: () => ({ isPending: false, mutateAsync: h.action }),
}));

import { AssistantPanel } from "../assistant-panel";

Element.prototype.scrollIntoView = vi.fn();

const PENDING = {
  id: "act1",
  kind: "award",
  severity: "critical",
  summary: ["Teklifi kazandır"],
};

async function sendText(text: string) {
  fireEvent.change(screen.getByPlaceholderText(/Bir şey sorun/), { target: { value: text } });
  fireEvent.click(screen.getByRole("button", { name: "Gönder" }));
}

beforeEach(() => {
  h.send.mockReset();
  h.action.mockReset();
  h.del.mockReset();
  h.sessions = [];
  h.loaded = { data: undefined, isFetching: false };
});

describe("AssistantPanel — sohbet akışı (S071)", () => {
  it("yanıt beklerken 'Yeni sohbet' → geç yanıt yeni sohbete eklenmez", async () => {
    const d = deferred<unknown>();
    h.send.mockReturnValueOnce(d.promise);
    render(<AssistantPanel />);
    await sendText("Taleplerimi göster");
    expect(screen.getByText("Taleplerimi göster")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /Yeni sohbet/ }));
    await act(async () => {
      d.resolve({ sessionId: "A", reply: "A sohbetinin yanıtı", toolsUsed: [], suggestNewChat: false });
      await d.promise;
    });
    expect(screen.queryByText("A sohbetinin yanıtı")).toBeNull();

    // Sonraki mesaj A'ya DEĞİL yeni oturuma gider.
    h.send.mockResolvedValueOnce({ sessionId: "B", reply: "ok", toolsUsed: [], suggestNewChat: false });
    await sendText("Yeni soru");
    await waitFor(() => expect(h.send).toHaveBeenCalledTimes(2));
    expect(h.send.mock.calls[1]![0].sessionId).toBeUndefined();
  });

  it("onay isteği hata verirse kart 'İptal edildi' değil, sonucun doğrulanamadığını söyler", async () => {
    h.send.mockResolvedValueOnce({
      sessionId: "S",
      reply: "Onaylar mısınız?",
      toolsUsed: [],
      suggestNewChat: false,
      pendingAction: PENDING,
    });
    h.action.mockRejectedValueOnce(new Error("timeout"));
    render(<AssistantPanel />);
    await sendText("Kazandır");
    fireEvent.click(await screen.findByRole("button", { name: "Onayla" }));
    expect(
      await screen.findByText(/sonucu doğrulanamadı; ilgili sayfadan kontrol edin/),
    ).toBeInTheDocument();
    expect(screen.queryByText("İptal edildi")).toBeNull();
  });

  it("vazgeç isteği hata verse de kart 'İptal edildi' der", async () => {
    h.send.mockResolvedValueOnce({
      sessionId: "S",
      reply: "Onaylar mısınız?",
      toolsUsed: [],
      suggestNewChat: false,
      pendingAction: PENDING,
    });
    h.action.mockRejectedValueOnce(new Error("x"));
    render(<AssistantPanel />);
    await sendText("Kazandır");
    fireEvent.click(await screen.findByRole("button", { name: "Vazgeç" }));
    expect(await screen.findByText("İptal edildi")).toBeInTheDocument();
  });

  it("aktif sohbeti silmek yalnız başarıda sohbeti temizler", async () => {
    h.sessions = [{ id: "S", title: "Sohbetim", lastMessageAt: "2026-09-30T10:00:00+03:00", turnCount: 1 }];
    h.send.mockResolvedValueOnce({ sessionId: "S", reply: "Merhaba", toolsUsed: [], suggestNewChat: false });
    const d = deferred<void>();
    h.del.mockReturnValueOnce(d.promise);
    render(<AssistantPanel />);
    await sendText("Selam");
    await screen.findByText("Merhaba");

    fireEvent.click(screen.getByRole("button", { name: "Geçmiş sohbetler" }));
    fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    expect(h.del).toHaveBeenCalledWith("S");
    // Sonuç gelmeden temizlenmez.
    expect(screen.getByText("Selam")).toBeInTheDocument();
    await act(async () => {
      d.resolve();
      await d.promise;
    });
    expect(screen.queryByText("Selam")).toBeNull();
  });

  it("aktif sohbet silinemezse sohbet yerinde kalır", async () => {
    h.sessions = [{ id: "S", title: "Sohbetim", lastMessageAt: "2026-09-30T10:00:00+03:00", turnCount: 1 }];
    h.send.mockResolvedValueOnce({ sessionId: "S", reply: "Merhaba", toolsUsed: [], suggestNewChat: false });
    h.del.mockRejectedValueOnce(new Error("500"));
    render(<AssistantPanel />);
    await sendText("Selam");
    await screen.findByText("Merhaba");

    fireEvent.click(screen.getByRole("button", { name: "Geçmiş sohbetler" }));
    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Sil" }));
    });
    expect(screen.getByText("Selam")).toBeInTheDocument();
  });

  it("aktif sohbet silinirken başka sohbet silinse de aktif sohbet başarıda temizlenir", async () => {
    h.sessions = [
      { id: "S", title: "Sohbetim", lastMessageAt: "2026-09-30T10:00:00+03:00", turnCount: 1 },
      { id: "T", title: "Diğeri", lastMessageAt: "2026-09-29T10:00:00+03:00", turnCount: 1 },
    ];
    h.send.mockResolvedValueOnce({ sessionId: "S", reply: "Merhaba", toolsUsed: [], suggestNewChat: false });
    const dS = deferred<void>();
    const dT = deferred<void>();
    h.del.mockReturnValueOnce(dS.promise).mockReturnValueOnce(dT.promise);
    render(<AssistantPanel />);
    await sendText("Selam");
    await screen.findByText("Merhaba");

    fireEvent.click(screen.getByRole("button", { name: "Geçmiş sohbetler" }));
    const [delS, delT] = screen.getAllByRole("button", { name: "Sil" });
    fireEvent.click(delS!);
    fireEvent.click(delT!);
    expect(h.del.mock.calls.map((c) => c[0])).toEqual(["S", "T"]);
    await act(async () => {
      dT.resolve();
      dS.resolve();
      await Promise.all([dS.promise, dT.promise]);
    });
    expect(screen.queryByText("Selam")).toBeNull();
  });

  it("geçmişten yükleme arka plan tazelemesi bitmeden yazılmaz", () => {
    h.sessions = [{ id: "S", title: "Eski", lastMessageAt: "2026-09-30T10:00:00+03:00", turnCount: 2 }];
    const msgs = (n: number) =>
      Array.from({ length: n }, (_, i) => ({
        id: `m${i}`,
        role: i % 2 ? "ASSISTANT" : "USER",
        content: `mesaj-${i}`,
        createdAt: "2026-09-30T10:00:00+03:00",
      }));
    h.loaded = { data: { id: "S", messages: msgs(2) }, isFetching: true };
    const { rerender } = render(<AssistantPanel />);
    fireEvent.click(screen.getByRole("button", { name: "Geçmiş sohbetler" }));
    fireEvent.click(screen.getByRole("button", { name: /Eski/ }));
    // Önbellekteki eski kopya (tazeleme sürüyor) ekrana yazılmaz.
    expect(screen.queryByText("mesaj-0")).toBeNull();

    h.loaded = { data: { id: "S", messages: msgs(4) }, isFetching: false };
    rerender(<AssistantPanel />);
    expect(screen.getByText("mesaj-3")).toBeInTheDocument();
  });
});
