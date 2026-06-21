"use client";

import type { AllThreadSummary, MessageSurface } from "@/lib/messages/types";
import { cn } from "@/lib/utils";
import { ChevronRight, MessageCircle } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { useAllThreads, useUnreadCount } from "@/hooks/use-messages";
import { ThreadListItem } from "./thread-list-item";

interface Props {
  surface: MessageSurface;
}

/**
 * V2-4 — Header sağ üst mesaj ikonu + dropdown.
 * Son 5 thread + "Tüm Mesajları Görüntüle" link'i.
 * Click outside → kapan. Thread tıklandığında bağlam sayfasına git.
 */
export function HeaderMessagesDropdown({ surface }: Props) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { data: threads } = useAllThreads(surface);
  const { data: unread } = useUnreadCount(surface);

  useEffect(() => {
    if (!open) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, [open]);

  const handleThreadClick = (t: AllThreadSummary) => {
    setOpen(false);
    // V2-4.2 — Unified thread: tıklamalar tek bir yere, /mesajlar'a contact
    // query param'ı ile gider. Tedarikçi/alıcı bazlı tüm konuşma orada
    // gösterilir; içeride mesaj başına context chip görülür.
    const base =
      surface === "tenant" ? "/dashboard/mesajlar" : "/supplier/mesajlar";
    router.push(`${base}?contact=${encodeURIComponent(t.otherPartyId)}`);
  };

  const allMessagesUrl =
    surface === "tenant" ? "/dashboard/mesajlar" : "/supplier/mesajlar";

  const unreadCount = unread?.count ?? 0;

  return (
    <div ref={ref} className="relative">
      <button
        type="button"
        onClick={() => setOpen((s) => !s)}
        className={cn(
          "relative p-2 rounded-lg transition-colors",
          "hover:bg-zinc-100 focus:outline-none focus-visible:ring-2 focus-visible:ring-zinc-500/30",
          open && "bg-zinc-100",
        )}
        aria-label="Mesajlar"
        aria-expanded={open}
      >
        <MessageCircle className="h-5 w-5 text-zinc-700" />
        {unreadCount > 0 ? (
          <span className="absolute -top-1 -right-1 bg-danger-500 text-white text-[10px] font-bold rounded-full h-5 min-w-[20px] flex items-center justify-center px-1 leading-none">
            {unreadCount > 9 ? "9+" : unreadCount}
          </span>
        ) : null}
      </button>

      {open ? (
        <div className="absolute right-0 top-full mt-2 w-96 max-w-[calc(100vw-2rem)] bg-white border border-zinc-200 rounded-2xl shadow-xl z-50 overflow-hidden">
          <div className="p-4 border-b border-zinc-200 flex items-center justify-between">
            <h3 className="font-bold text-zinc-900 text-sm">Mesajlar</h3>
            {unreadCount > 0 ? (
              <span className="text-xs text-zinc-500">
                {unreadCount} okunmamış
              </span>
            ) : null}
          </div>

          <div className="max-h-96 overflow-y-auto p-2 space-y-1">
            {!threads || threads.length === 0 ? (
              <div className="text-center py-8">
                <p className="text-sm text-zinc-500">Henüz mesaj yok</p>
                <p className="text-xs text-zinc-400 mt-1">
                  Sipariş veya ihale detayından bir konuşma başlat
                </p>
              </div>
            ) : (
              threads
                .slice(0, 5)
                .map((t) => (
                  <ThreadListItem
                    key={t.threadId}
                    thread={t}
                    onClick={() => handleThreadClick(t)}
                  />
                ))
            )}
          </div>

          <Link
            href={allMessagesUrl}
            onClick={() => setOpen(false)}
            className="flex items-center justify-center gap-1 p-3 border-t border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition-colors"
          >
            Tüm Mesajları Görüntüle
            <ChevronRight className="h-4 w-4" />
          </Link>
        </div>
      ) : null}
    </div>
  );
}
