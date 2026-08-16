"use client";

import {
  useMarkAllNotificationsRead,
  useMarkNotificationsRead,
  useNotifications,
  useUnreadCount,
  type AppNotification,
  type NotificationPortal,
} from "@/hooks/use-notifications";
import {
  Popover,
  PopoverButton,
  PopoverPanel,
} from "@headlessui/react";
import { Bell } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";

function timeAgo(iso: string): string {
  const d = new Date(iso).getTime();
  const diff = Date.now() - d;
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk önce`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa önce`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün önce`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

/** Panel rozeti — birleşik kutuda bildirim hangi şapkayla ilgili? */
const PORTAL_CHIP: Record<NotificationPortal, { label: string; cls: string }> = {
  satinalma: { label: "Satınalma", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "Satış", cls: "bg-emerald-50 text-emerald-700" },
};

/** Panel içeriği ayrı bileşen — liste sorgusu yalnızca popover AÇILINCA atılır
 *  (B18: önceden her sayfa yüklemesinde /notifications listesi çekiliyordu;
 *  rozet için unread-count yeterli). */
function BellPanelContent({
  unread,
  close,
}: {
  unread: number;
  close: () => void;
}) {
  // TEK kutu (kullanıcı isteği): portal filtresi yok — iki panelin
  // bildirimleri birlikte, satır başına panel rozetiyle.
  const { data: items = [], isLoading } = useNotifications();
  const markRead = useMarkNotificationsRead();
  const markAll = useMarkAllNotificationsRead();
  const router = useRouter();

  const recent = items.slice(0, 8);

  const onItemClick = (n: AppNotification) => {
    if (!n.readAt) markRead.mutate([n.id]);
    if (n.ctaUrl) {
      const path = n.ctaUrl.replace(/^https?:\/\/[^/]+/, "");
      router.push(path || "/company");
    }
  };

  return (
    <>
      <div className="flex shrink-0 items-center justify-between border-b border-zinc-100 px-4 py-3">
        <span className="text-sm font-semibold text-zinc-900">
          Bildirimler
        </span>
        {unread > 0 ? (
          <button
            type="button"
            onClick={() => markAll.mutate(undefined)}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Tümünü okundu işaretle
          </button>
        ) : null}
      </div>

      <div className="min-h-0 flex-1 overflow-y-auto">
        {isLoading ? (
          <p className="px-4 py-6 text-center text-sm text-zinc-400">
            Yükleniyor…
          </p>
        ) : recent.length === 0 ? (
          <p className="px-4 py-8 text-center text-sm text-zinc-400">
            Henüz bildiriminiz yok.
          </p>
        ) : (
          <ul className="divide-y divide-zinc-50">
            {recent.map((n) => (
              <li key={n.id}>
                <button
                  type="button"
                  onClick={() => {
                    onItemClick(n);
                    close();
                  }}
                  className={`flex w-full flex-col gap-1 px-4 py-3 text-left transition hover:bg-zinc-50 ${
                    n.readAt ? "" : "bg-blue-50/40"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    {!n.readAt ? (
                      <span
                        className="size-1.5 shrink-0 rounded-full bg-blue-500"
                        aria-hidden="true"
                      />
                    ) : null}
                    <span className="text-sm font-medium text-zinc-900">
                      {n.title}
                    </span>
                    {n.portal ? (
                      <span
                        className={`ml-auto shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${PORTAL_CHIP[n.portal].cls}`}
                      >
                        {PORTAL_CHIP[n.portal].label}
                      </span>
                    ) : null}
                  </div>
                  <span className="line-clamp-2 text-xs text-zinc-500">
                    {n.body}
                  </span>
                  <span className="text-xs text-zinc-400">
                    {timeAgo(n.createdAt)}
                  </span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="shrink-0 border-t border-zinc-100 px-4 py-2 text-center">
        <Link
          href="/company/bildirimler"
          onClick={() => close()}
          className="text-xs font-semibold text-zinc-600 hover:text-zinc-900"
        >
          Tüm bildirimleri gör
        </Link>
      </div>
    </>
  );
}

export function NotificationBell({ onDark = false }: { onDark?: boolean }) {
  const { data: unread = 0 } = useUnreadCount();

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={`Bildirimler${unread > 0 ? ` (${unread} okunmamış)` : ""}`}
        className={`relative flex size-10 items-center justify-center rounded-lg focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500 ${
          onDark
            ? "text-zinc-400 hover:bg-white/10 hover:text-white"
            : "text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900"
        }`}
      >
        <Bell className="size-5" aria-hidden="true" />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        // B16: panel viewport'a sığar (--anchor-max-height); liste iç scroll,
        // başlık/footer sabit — son öğe kesilmez, footer üstüne binmez.
        className="z-50 mt-2 flex w-[22rem] flex-col overflow-hidden rounded-xl border border-zinc-950/10 bg-white shadow-lg ring-1 ring-zinc-950/5 [--anchor-gap:0.25rem] max-h-[min(var(--anchor-max-height),30rem)]"
      >
        {({ close }) => <BellPanelContent unread={unread} close={close} />}
      </PopoverPanel>
    </Popover>
  );
}
