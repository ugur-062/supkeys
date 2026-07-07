"use client";

import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { io, type Socket } from "socket.io-client";

/**
 * Firma WS bağlantısı (tekil). WS yalnızca "değişti" sinyali taşır — veri her
 * zaman yetkili REST'ten çekilir. Bağlantı koptuğunda socket.io kendi kendine
 * yeniden bağlanır; poll'lar zaten yedek olarak çalışmaya devam eder.
 */
let socket: Socket | null = null;

function wsOrigin(): string {
  // API base "…/api" ile biter; WS sunucu kökünde /rt path'inde dinler.
  return resolveApiBaseUrl().replace(/\/api\/?$/, "");
}

export function connectRealtime(): Socket {
  if (socket) return socket;
  // Kimlik httpOnly cookie'den — handshake withCredentials ile cookie gönderir
  // (gateway rk_company okur). Bearer/auth.token taşınmaz.
  socket = io(wsOrigin(), {
    path: "/rt",
    withCredentials: true,
    transports: ["websocket"],
    reconnectionDelayMax: 10_000,
  });
  return socket;
}

export function disconnectRealtime(): void {
  socket?.disconnect();
  socket = null;
}

export function getRealtime(): Socket | null {
  return socket;
}

/** Detay sayfaları: kayda abone ol (unmount'ta ayrıl). */
export function subscribeRealtime(
  kind: "listing" | "order",
  id: string,
): () => void {
  const s = socket;
  if (!s) return () => undefined;
  const join = () => s.emit("subscribe", { kind, id });
  join();
  // Yeniden bağlanınca oda üyeliği kaybolur — tekrar katıl.
  s.on("connect", join);
  return () => {
    s.off("connect", join);
    s.emit("unsubscribe", { kind, id });
  };
}
