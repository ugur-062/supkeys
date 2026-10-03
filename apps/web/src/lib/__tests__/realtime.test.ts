import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

/**
 * Derin denetim LU-19: sunucu soketi token exp'inde kapatınca
 * ("io server disconnect") socket.io-client kendiliğinden yeniden bağlanmaz;
 * lib/realtime elle ve geri çekilerek yeniden bağlanmalı.
 */
type Handler = (...args: unknown[]) => void;

class FakeSocket {
  connected = true;
  handlers = new Map<string, Handler[]>();
  connect = vi.fn(() => {
    this.connected = true;
    this.fire("connect");
  });
  disconnect = vi.fn(() => {
    this.connected = false;
  });
  emit = vi.fn();
  on(ev: string, h: Handler) {
    this.handlers.set(ev, [...(this.handlers.get(ev) ?? []), h]);
    return this;
  }
  off() {
    return this;
  }
  fire(ev: string, ...args: unknown[]) {
    for (const h of this.handlers.get(ev) ?? []) h(...args);
  }
}

let created: FakeSocket[] = [];
vi.mock("socket.io-client", () => ({
  io: () => {
    const s = new FakeSocket();
    created.push(s);
    return s;
  },
}));
vi.mock("@/lib/resolve-api-url", () => ({
  resolveApiBaseUrl: () => "https://api.test/api",
}));

import { connectRealtime, disconnectRealtime } from "../realtime";

beforeEach(() => {
  vi.useFakeTimers();
  created = [];
});
afterEach(() => {
  disconnectRealtime();
  vi.useRealTimers();
});

describe("realtime — sunucunun kapattığı soket yeniden bağlanır", () => {
  it("io server disconnect → gecikmeyle connect() çağrılır", () => {
    connectRealtime();
    const s = created[0]!;
    s.fire("connect");
    s.connected = false;
    s.fire("disconnect", "io server disconnect");
    expect(s.connect).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(s.connect).toHaveBeenCalledTimes(1);
  });

  it("art arda hızlı reddedilen handshake'lerde gecikme üstel artar", () => {
    connectRealtime();
    const s = created[0]!;
    s.connect.mockImplementation(() => {
      s.connected = true;
      s.fire("connect");
      // Sunucu handshake'i hemen reddeder.
      s.connected = false;
      s.fire("disconnect", "io server disconnect");
    });
    s.connected = false;
    s.fire("disconnect", "io server disconnect");
    vi.advanceTimersByTime(1_000);
    expect(s.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1_999);
    expect(s.connect).toHaveBeenCalledTimes(1);
    vi.advanceTimersByTime(1);
    expect(s.connect).toHaveBeenCalledTimes(2);
  });

  it("istemci kaynaklı kopma ve çıkış sonrası yeniden bağlanmaz", () => {
    connectRealtime();
    const s = created[0]!;
    s.connected = false;
    s.fire("disconnect", "transport close"); // socket.io kendi halleder
    vi.advanceTimersByTime(60_000);
    expect(s.connect).not.toHaveBeenCalled();

    s.fire("disconnect", "io server disconnect");
    disconnectRealtime(); // çıkış
    vi.advanceTimersByTime(60_000);
    expect(s.connect).not.toHaveBeenCalled();
  });
});
