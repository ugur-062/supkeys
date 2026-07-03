"use client";

import { useThreads, useUnreadMessages } from "@/hooks/use-company-messages";
import type { PortalKey } from "@/lib/company/portals";
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

/** Panel içeriği ayrı bileşen — thread sorgusu yalnızca popover AÇILINCA atılır. */
function RecentThreads({
  portal,
  basePath,
  close,
}: {
  portal: PortalKey;
  basePath: string;
  close: () => void;
}) {
  const { data: threads, isLoading } = useThreads(portal);
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
        <p className="mt-2 text-sm text-zinc-500">Henüz mesajın yok.</p>
      </div>
    );
  }
  return (
    <ul className="max-h-80 overflow-y-auto">
      {recent.map((t) => (
        <li key={t.threadId}>
          <Link
            href={`${basePath}/mesajlar?with=${t.otherPartyId}`}
            onClick={close}
            className="flex items-start gap-3 px-4 py-2.5 transition hover:bg-zinc-50"
          >
            <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-zinc-100 text-xs font-bold text-zinc-600">
              {t.otherPartyName.slice(0, 2).toUpperCase()}
            </span>
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
                <span className="shrink-0 text-[11px] text-zinc-400">
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
export function MessagesPopover({
  portal,
  basePath,
}: {
  portal: PortalKey;
  basePath: string;
}) {
  const { data: unreadData } = useUnreadMessages(portal);
  const unread = unreadData?.count ?? 0;

  return (
    <Popover className="relative">
      <PopoverButton
        aria-label={`Mesajlar${unread > 0 ? ` (${unread} okunmamış)` : ""}`}
        className="relative flex size-10 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
      >
        <MessageSquare className="size-5" aria-hidden />
        {unread > 0 ? (
          <span className="absolute top-1.5 right-1.5 flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
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
              <span className="text-[11px] uppercase tracking-wide text-zinc-400">
                {portal === "satinalma" ? "Satınalma" : "Satış"}
              </span>
            </div>
            <RecentThreads
              portal={portal}
              basePath={basePath}
              close={close}
            />
            <div className="border-t border-zinc-100 px-4 py-2.5 text-center">
              <Link
                href={`${basePath}/mesajlar`}
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
