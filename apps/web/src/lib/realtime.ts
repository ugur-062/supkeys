"use client";

import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import { io, type Socket } from "socket.io-client";

/**
 * Firma WS bağlantısı (tekil). WS yalnızca "değişti" sinyali taşır — veri her
 * zaman yetkili REST'ten çekilir. Ağ kopmasında socket.io kendi kendine
 * yeniden bağlanır; sunucunun kapattığı soket (token exp) aşağıda elle
 * yeniden bağlanır. Poll'lar zaten yedek olarak çalışmaya devam eder.
 */
let socket: Socket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;

// Derin denetim LU-19: sunucu soketi token exp'inde (ya da handshake reddinde)
// `disconnect(true)` ile kapatır; socket.io-client "io server disconnect"
// nedeninde KENDİLİĞİNDEN yeniden bağlanmaz. Kayan oturum çerezi tazelediği
// için kullanıcı oturumda kalır ama canlı sinyaller sayfa yenilenene dek
// ölürdü. Burada elle yeniden bağlanılır; hızlı kopmalar (reddedilen
// handshake) üstel geri çekilir ki çerezi geçersiz sekme sunucuyu dövmesin.
const RECONNECT_BASE_MS = 1_000;
const RECONNECT_MAX_MS = 5 * 60_000;
/** Bu süreden uzun yaşamış bağlantının kopması "sağlıklı" sayılır → sayaç sıfır. */
const STABLE_CONNECTION_MS = 60_000;

function scheduleServerReconnect(s: Socket, attempt: number): void {
  const delay = Math.min(RECONNECT_BASE_MS * 2 ** attempt, RECONNECT_MAX_MS);
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = setTimeout(() => {
    reconnectTimer = null;
    // Bu arada çıkış yapıldıysa (disconnectRealtime) ölü soketi diriltme.
    if (socket === s && !s.connected) s.connect();
  }, delay);
}

function attachServerReconnect(s: Socket): void {
  let attempt = 0;
  let connectedAt = 0;
  s.on("connect", () => {
    connectedAt = Date.now();
  });
  s.on("disconnect", (reason) => {
    if (reason !== "io server disconnect" || socket !== s) return;
    if (connectedAt && Date.now() - connectedAt >= STABLE_CONNECTION_MS) {
      attempt = 0;
    }
    scheduleServerReconnect(s, attempt);
    attempt += 1;
  });
}

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
  attachServerReconnect(socket);
  return socket;
}

export function disconnectRealtime(): void {
  if (reconnectTimer) clearTimeout(reconnectTimer);
  reconnectTimer = null;
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
  // connectRealtime idempotent — doğrudan yüklemede (F5) sayfa efekti
  // RealtimeProvider'ınkinden ÖNCE koşar; socket'i burada kurmazsak
  // abonelik sessizce hiç oluşmaz ve oda sinyalleri o ziyarette kaybolur.
  const s = connectRealtime();
  const join = () => s.emit("subscribe", { kind, id });
  join();
  // Yeniden bağlanınca oda üyeliği kaybolur — tekrar katıl.
  s.on("connect", join);
  return () => {
    s.off("connect", join);
    s.emit("unsubscribe", { kind, id });
  };
}
