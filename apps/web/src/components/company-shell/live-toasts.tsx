"use client";

import type { AppNotification } from "@/hooks/use-notifications";
import type { ThreadSummary } from "@/hooks/use-company-messages";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { companyApi } from "@/lib/company-auth/api";
import { playNotificationSound } from "@/lib/notification-sound";
import { connectRealtime } from "@/lib/realtime";
import {
  canUseMessaging,
  PORTAL_ORDER,
  PORTALS,
  type PortalKey,
} from "@/lib/company/portals";
import { useQueryClient } from "@tanstack/react-query";
import { Bell, MessageSquare, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { toast } from "sonner";
import { NOTIFICATION_KEY } from "@/hooks/use-notifications";
import { MESSAGE_KEYS } from "@/hooks/use-company-messages";

/**
 * Canlı popup köprüsü — WS sinyali geldiği AN sağ altta Facebook tarzı kart
 * düşürür (bildirim + yeni mesaj). Sinyal-only mimari korunur: WS veri
 * taşımaz, kart içeriği sinyal gelince yetkili REST'ten çekilir.
 *
 * Yanlış-pozitif koruması: oturum açılışında var olan okunmamışlar
 * toast'lanmaz (ilk anlık görüntü tohumlanır); görülenler modül-seviyesi
 * store'da tutulur ki StrictMode/yeniden-mount çift göstermesin.
 */

const TOAST_MS = 8_000;
const MAX_CARDS_PER_BATCH = 3;

interface SeenStore {
  userId: string;
  seeded: boolean;
  notifIds: Set<string>;
  /** `${portal}:${threadId}` → son görülen lastMessageAt (ISO). */
  threadSeen: Map<string, string>;
}

let store: SeenStore | null = null;

function storeFor(userId: string): SeenStore {
  if (!store || store.userId !== userId) {
    store = {
      userId,
      seeded: false,
      notifIds: new Set(),
      threadSeen: new Map(),
    };
  }
  return store;
}

/** ctaUrl mutlak gelebilir — path'e indir (zil ile aynı davranış). */
function toPath(ctaUrl: string | null): string {
  const path = (ctaUrl ?? "").replace(/^https?:\/\/[^/]+/, "");
  return path || "/company/bildirimler";
}

/** Kullanıcı şu an bu konuşmanın içinde mi? (birleşik kutu:
 *  /company/mesajlar?with=<id>&portal=<p>; portal paramı yoksa firma eşleşmesi yeter.) */
function viewingThread(portal: PortalKey, otherPartyId: string): boolean {
  if (typeof window === "undefined") return false;
  if (window.location.pathname !== "/company/mesajlar") return false;
  const q = new URLSearchParams(window.location.search);
  if (q.get("with") !== otherPartyId) return false;
  const p = q.get("portal");
  return p === null || p === portal;
}

function PopupCard({
  icon,
  accent,
  title,
  body,
  chip,
  onOpen,
  onClose,
}: {
  icon: React.ReactNode;
  accent: "blue" | "emerald";
  title: string;
  body: string;
  chip?: string;
  onOpen: () => void;
  onClose: () => void;
}) {
  return (
    <div className="pointer-events-auto flex w-[22rem] items-start gap-3 rounded-xl border border-zinc-950/10 bg-white p-3.5 shadow-lg ring-1 ring-zinc-950/5">
      <span
        className={`mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full ${
          accent === "emerald"
            ? "bg-emerald-50 text-emerald-600"
            : "bg-blue-50 text-blue-600"
        }`}
        aria-hidden="true"
      >
        {icon}
      </span>
      <button
        type="button"
        onClick={onOpen}
        className="min-w-0 flex-1 text-left focus:outline-none"
      >
        <span className="flex items-center gap-2">
          <span className="truncate text-sm font-semibold text-zinc-900">
            {title}
          </span>
          {chip ? (
            <span className="shrink-0 rounded-full bg-zinc-100 px-1.5 py-0.5 text-xs font-medium uppercase tracking-wide text-zinc-500">
              {chip}
            </span>
          ) : null}
        </span>
        <span className="mt-0.5 line-clamp-2 block text-xs text-zinc-500">
          {body}
        </span>
      </button>
      <button
        type="button"
        onClick={onClose}
        aria-label="Kapat"
        className="shrink-0 rounded-md p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600"
      >
        <X className="size-3.5" aria-hidden="true" />
      </button>
    </div>
  );
}

export function LiveToasts() {
  const { user } = useCompanyAuth();
  const qc = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    if (!user) return;
    const seen = storeFor(user.id);
    // Mesaj kartları yalnız işlem rolü olan portallardan (API aynası: rolsüz
    // portalın threads ucu 403 verir).
    const portals = PORTAL_ORDER.filter((p) =>
      canUseMessaging(user, p),
    );
    const socket = connectRealtime();

    // Perf turu (denetim P10 Dalga B): bu iki çekim HAM axios ile yapılıyordu,
    // yani zil rozeti (`useNotifications`) ve gelen kutusu (`useThreads`) aynı
    // uçları KENDİ query'leriyle ayrıca çekiyordu → her WS sinyalinde aynı
    // veri iki kez iniyordu. `fetchQuery` aynı anahtarları kullanır: tek istek
    // hem toast'ı besler hem de listelerin önbelleğini tazeler (kullanıcı
    // zile tıkladığında ekstra tur atılmaz).
    const fetchNotifications = () =>
      qc
        .fetchQuery({
          queryKey: [...NOTIFICATION_KEY, "list", "all"],
          queryFn: async () => {
            const { data } =
              await companyApi.get<AppNotification[]>("/notifications");
            return data;
          },
          staleTime: 0,
        })
        .catch(() => [] as AppNotification[]);
    const fetchThreads = (portal: PortalKey) =>
      qc
        .fetchQuery({
          queryKey: MESSAGE_KEYS.threads(portal),
          queryFn: async () => {
            // Backend satırları artık portal alanını taşıyor.
            const { data } = await companyApi.get<ThreadSummary[]>(
              "/company/messages/threads",
              { params: { portal } },
            );
            return data;
          },
          staleTime: 0,
        })
        .catch(() => [] as ThreadSummary[]);

    const showNotification = (n: AppNotification) => {
      // Yetki tablosu (Faz 4): yetki değişince kimlik anında yenilenir —
      // menü/kapılar yeni izinlere göre çizilir (sunucu zaten taze).
      if (n.type === "permissions_changed") {
        qc.invalidateQueries({ queryKey: ["company-auth", "me"] });
      }
      const chip = n.portal ? PORTALS[n.portal].label : undefined;
      toast.custom(
        (t) => (
          <PopupCard
            icon={<Bell className="size-4" aria-hidden="true" />}
            accent="blue"
            title={n.title}
            body={n.body}
            chip={chip}
            onOpen={() => {
              toast.dismiss(t);
              companyApi
                .post("/notifications/read", { ids: [n.id] })
                .catch(() => undefined)
                .finally(() =>
                  qc.invalidateQueries({ queryKey: ["company-notifications"] }),
                );
              router.push(toPath(n.ctaUrl));
            }}
            onClose={() => toast.dismiss(t)}
          />
        ),
        { id: `live-notif-${n.id}`, position: "bottom-right", duration: TOAST_MS },
      );
    };

    const showMessage = (portal: PortalKey, t: ThreadSummary) => {
      toast.custom(
        (id) => (
          <PopupCard
            icon={<MessageSquare className="size-4" aria-hidden="true" />}
            accent="emerald"
            title={t.otherPartyName}
            body={t.lastMessagePreview ?? "Yeni mesaj"}
            chip={PORTALS[portal].label}
            onOpen={() => {
              toast.dismiss(id);
              router.push(
                `/company/mesajlar?with=${t.otherPartyId}&portal=${portal}`,
              );
            }}
            onClose={() => toast.dismiss(id)}
          />
        ),
        {
          id: `live-msg-${portal}-${t.threadId}-${t.lastMessageAt ?? ""}`,
          position: "bottom-right",
          duration: TOAST_MS,
        },
      );
    };

    const summaryCard = (count: number) => {
      toast.custom(
        (t) => (
          <PopupCard
            icon={<Bell className="size-4" aria-hidden="true" />}
            accent="blue"
            title={`+${count} yeni bildirim daha`}
            body="Tümünü görmek için tıkla."
            onOpen={() => {
              toast.dismiss(t);
              router.push("/company/bildirimler");
            }}
            onClose={() => toast.dismiss(t)}
          />
        ),
        { position: "bottom-right", duration: TOAST_MS },
      );
    };

    const onNotification = async () => {
      const items = await fetchNotifications();
      const fresh = items.filter((n) => !n.readAt && !seen.notifIds.has(n.id));
      for (const n of items) seen.notifIds.add(n.id);
      if (!seen.seeded) return; // tohumlanmadan sinyal geldi — sessiz geç
      // Batch başına TEK ses (kart başına değil — 3 kart + özet aynı "ding").
      if (fresh.length > 0) playNotificationSound();
      // En yenisi önce zaten; sırayla en fazla 3 kart + kalanı özet.
      fresh.slice(0, MAX_CARDS_PER_BATCH).forEach(showNotification);
      if (fresh.length > MAX_CARDS_PER_BATCH)
        summaryCard(fresh.length - MAX_CARDS_PER_BATCH);
    };

    const onMessage = async () => {
      const lists = await Promise.all(portals.map(fetchThreads));
      let shown = 0;
      for (const t of lists.flat()) {
        const key = `${t.portal}:${t.threadId}`;
        const prev = seen.threadSeen.get(key);
        const isNew =
          t.unread && !!t.lastMessageAt && (!prev || t.lastMessageAt > prev);
        if (t.lastMessageAt) seen.threadSeen.set(key, t.lastMessageAt);
        if (!seen.seeded || !isNew) continue;
        if (viewingThread(t.portal, t.otherPartyId)) continue;
        // Batch başına TEK ses — ilk gösterilen kartla birlikte.
        if (shown === 0) playNotificationSound();
        shown += 1;
        showMessage(t.portal, t);
      }
    };

    // Yarışları serileştir: art arda sinyaller tek kuyruğa girer, kaybolmaz.
    let chain: Promise<unknown> = seen.seeded
      ? Promise.resolve()
      : Promise.all([onNotification(), onMessage()]).then(() => {
          seen.seeded = true;
        });
    const queue = (fn: () => Promise<void>) => {
      chain = chain.then(fn, fn);
    };
    const handleNotification = () => queue(onNotification);
    const handleMessage = () => queue(onMessage);

    socket.on("notification.new", handleNotification);
    socket.on("message.new", handleMessage);
    return () => {
      socket.off("notification.new", handleNotification);
      socket.off("message.new", handleMessage);
    };
  }, [user, qc, router]);

  return null;
}
