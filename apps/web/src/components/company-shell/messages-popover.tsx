"use client";

import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  useThreads,
  useUnreadMessages,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { Popover, PopoverButton, PopoverPanel } from "@headlessui/react";
import { MessageSquare } from "lucide-react";
import Link from "next/link";

function timeAgo(iso: string | null): string {
  if (!iso) return "";
  const diff = Date.now() - new Date(iso).getTime();
  const min = Math.floor(diff / 60000);
  if (min < 1) return "az önce";
  if (min < 60) return `${min} dk`;
  const hr = Math.floor(min / 60);
  if (hr < 24) return `${hr} sa`;
  const day = Math.floor(hr / 24);
  if (day < 7) return `${day} gün`;
  return new Date(iso).toLocaleDateString("tr-TR");
}

/** "Bu konuşmada ben kimim?" rozeti — birleşik kutu satırları. */
const ROLE_CHIP: Record<MessagePortal, { label: string; cls: string }> = {
  satinalma: { label: "Alıcısınız", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "Satıcısınız", cls: "bg-emerald-50 text-emerald-700" },
};

/** Panel içeriği ayrı bileşen — thread sorgusu yalnızca popover AÇILINCA atılır. */
function RecentThreads({ close }: { close: () => void }) {
  // Birleşik kutu (2026-08-02): iki tarafın konuşmaları birlikte.
  const { data: threads, isLoading } = useThreads("all");
  const recent = (threads ?? []).slice(0, 6);

  if (isLoading) {
    return (
      <div className="space-y-2 p-3" aria-hidden>
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100" />
        ))}
      </div>
    );
  }
  if (recent.length === 0) {
    return (
      <div className="px-4 py-10 text-center">
        <MessageSquare className="mx-auto size-7 text-zinc-300" aria-hidden />
        <p className="mt-2 text-sm text-zinc-500">Henüz mesajınız yok.</p>
      </div>
    );
  }
  return (
    <ul className="max-h-80 overflow-y-auto">
      {recent.map((t) => (
        <li key={`${t.portal}:${t.threadId}`}>
          <Link
            href={`/company/mesajlar?with=${t.otherPartyId}&portal=${t.portal}`}
            onClick={close}
            className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-zinc-50"
          >
            <AvatarInitials
              name={t.otherPartyName}
              size="sm"
              className="mt-0.5"
            />
            <span className="min-w-0 flex-1">
              <span className="flex items-baseline justify-between gap-2">
                <span
                  className={`truncate text-sm ${
                    t.unread
                      ? "font-semibold text-zinc-900"
                      : "font-medium text-zinc-700"
                  }`}
                >
                  {t.otherPartyName}
                </span>
                <span
                  className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[t.portal].cls}`}
                >
                  {ROLE_CHIP[t.portal].label}
                </span>
                <span className="shrink-0 text-xs text-zinc-400">
                  {timeAgo(t.lastMessageAt)}
                </span>
              </span>
              <span
                className={`block truncate text-xs ${
                  t.unread ? "font-medium text-zinc-700" : "text-zinc-400"
                }`}
              >
                {t.lastMessagePreview ?? "—"}
              </span>
            </span>
            {t.unread ? (
              <span
                className="mt-2 size-2 shrink-0 rounded-full bg-blue-500"
                aria-label="Okunmamış"
              />
            ) : null}
          </Link>
        </li>
      ))}
    </ul>
  );
}

/**
 * Topbar mesaj önizlemesi — zil deseniyle aynı: son konuşmalar + okunmamış
 * rozeti; öğe tıklaması ilgili konuşmayı açar (?with=), altta "Tüm mesajlar".
 */
export function MessagesPopover() {
  // TEK kutu: rozet iki tarafın toplam okunmamışı (backend rolsüz tarafı saymaz).
  const { data: unreadData } = useUnreadMessages();
  const unread = unreadData?.count ?? 0;

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={`Mesajlar${unread > 0 ? ` (${unread} okunmamış)` : ""}`}
        className="relative flex size-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MessageSquare className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-xs font-semibold text-white">
            {unread > 9 ? "9+" : unread}
          </span>
        ) : null}
      </PopoverButton>

      <PopoverPanel
        anchor="bottom end"
        className="z-50 mt-2 w-[22rem] rounded-xl border border-zinc-950/10 bg-white shadow-lg ring-1 ring-zinc-950/5 [--anchor-gap:0.25rem]"
      >
        {({ close }) => (
          <>
            <div className="flex items-center justify-between border-b border-zinc-100 px-4 py-3">
              <span className="text-sm font-semibold text-zinc-900">
                Mesajlar
              </span>
            </div>
            <RecentThreads close={close} />
            <div className="border-t border-zinc-100 px-4 py-2.5 text-center">
              <Link
                href="/company/mesajlar"
                onClick={() => close()}
                className="text-sm font-semibold text-zinc-700 hover:text-zinc-950"
              >
                Tüm mesajları gör
              </Link>
            </div>
          </>
        )}
      </PopoverPanel>
    </Popover>
  );
}
