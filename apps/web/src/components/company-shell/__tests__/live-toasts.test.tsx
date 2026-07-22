// @vitest-environment jsdom
import { render, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";

const h = vi.hoisted(() => ({
  user: null as { id: string; roles: string[] } | null,
  tier: "GOLD" as "GOLD" | "STANDART",
  notifs: [] as unknown[],
  threads: {} as Record<string, unknown[]>,
  handlers: {} as Record<string, () => void>,
  get: vi.fn(),
  post: vi.fn(),
  toastCustom: vi.fn(),
  push: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ push: h.push }),
}));
vi.mock("sonner", () => ({
  toast: Object.assign(vi.fn(), {
    custom: h.toastCustom,
    dismiss: vi.fn(),
  }),
}));
vi.mock("@tanstack/react-query", () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));
vi.mock("@/hooks/use-company-auth", () => ({
  useCompanyAuth: () => ({
    user: h.user,
    company: h.user ? { tier: h.tier } : null,
  }),
}));
vi.mock("@/lib/company-auth/api", () => ({
  companyApi: {
    get: (...a: unknown[]) => h.get(...a),
    post: (...a: unknown[]) => h.post(...a),
  },
}));
vi.mock("@/lib/realtime", () => ({
  connectRealtime: () => ({
    on: (ev: string, fn: () => void) => {
      h.handlers[ev] = fn;
    },
    off: vi.fn(),
  }),
}));

import { LiveToasts } from "../live-toasts";

let userSeq = 0;

function notif(id: string, readAt: string | null = null) {
  return {
    id,
    type: "bid_received",
    portal: "satinalma",
    title: `Bildirim ${id}`,
    body: "gövde",
    ctaUrl: null,
    ctaLabel: null,
    listingId: null,
    readAt,
    createdAt: new Date().toISOString(),
  };
}

function thread(threadId: string, lastMessageAt: string, unread = true) {
  return {
    threadId,
    otherPartyId: `op-${threadId}`,
    otherPartyName: `Firma ${threadId}`,
    lastMessagePreview: "selam",
    lastMessageAt,
    unread,
  };
}

/** Tohumlama bitene dek bekle: 1 bildirim + 2 portal thread GET'i. */
async function renderSeeded() {
  render(<LiveToasts />);
  await waitFor(() => expect(h.get.mock.calls.length).toBeGreaterThanOrEqual(3));
  // Kuyruk zinciri seeded=true işaretini koysun.
  await new Promise((r) => setTimeout(r, 0));
}

beforeEach(() => {
  vi.clearAllMocks();
  h.handlers = {};
  h.notifs = [];
  h.threads = { satinalma: [], satis: [] };
  // Modül-seviyesi görülenler store'u kullanıcıya bağlı — her test taze kullanıcı.
  h.user = { id: `u${++userSeq}`, roles: ["SAHIP"] };
  h.tier = "GOLD";
  window.history.pushState({}, "", "/company/satinalma");
  h.get.mockImplementation((url: string, opts?: { params?: { portal?: string } }) => {
    if (url === "/notifications") return Promise.resolve({ data: h.notifs });
    if (url === "/company/messages/threads")
      return Promise.resolve({ data: h.threads[opts?.params?.portal ?? ""] ?? [] });
    return Promise.reject(new Error(`beklenmeyen GET ${url}`));
  });
  h.post.mockResolvedValue({ data: {} });
});

describe("LiveToasts", () => {
  it("oturum açılışındaki mevcut okunmamışları toast'lamaz, sonra geleni toast'lar", async () => {
    h.notifs = [notif("eski")];
    await renderSeeded();
    expect(h.toastCustom).not.toHaveBeenCalled();

    h.notifs = [notif("yeni"), notif("eski")];
    h.handlers["notification.new"]();
    await waitFor(() => expect(h.toastCustom).toHaveBeenCalledTimes(1));
    expect(h.toastCustom.mock.calls[0][1]).toMatchObject({
      id: "live-notif-yeni",
      position: "bottom-right",
    });
  });

  it("okunmuş veya daha önce görülen bildirim yeniden toast'lanmaz", async () => {
    await renderSeeded();
    h.notifs = [notif("okunmus", new Date().toISOString())];
    h.handlers["notification.new"]();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.toastCustom).not.toHaveBeenCalled();
  });

  it("yeni mesajda gönderen adıyla kart düşer; aynı mesaj ikinci sinyalde tekrarlamaz", async () => {
    h.threads.satis = [thread("t1", "2026-07-12T10:00:00.000Z")];
    await renderSeeded();
    expect(h.toastCustom).not.toHaveBeenCalled(); // tohum — toast yok

    h.threads.satis = [thread("t1", "2026-07-12T10:05:00.000Z")];
    h.handlers["message.new"]();
    await waitFor(() => expect(h.toastCustom).toHaveBeenCalledTimes(1));
    expect(String(h.toastCustom.mock.calls[0][1].id)).toContain("live-msg-satis-t1");

    // Değişmemiş thread ile ikinci sinyal → yeni kart yok.
    h.handlers["message.new"]();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.toastCustom).toHaveBeenCalledTimes(1);
  });

  it("kullanıcı o konuşmanın içindeyse mesaj popup'ı bastırılır", async () => {
    h.threads.satis = [thread("t2", "2026-07-12T10:00:00.000Z")];
    await renderSeeded();

    window.history.pushState({}, "", "/company/satis/mesajlar?with=op-t2");
    h.threads.satis = [thread("t2", "2026-07-12T10:09:00.000Z")];
    h.handlers["message.new"]();
    await new Promise((r) => setTimeout(r, 10));
    expect(h.toastCustom).not.toHaveBeenCalled();
  });
});
