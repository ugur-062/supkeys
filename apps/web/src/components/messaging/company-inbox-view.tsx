"use client";

import { PageHeader } from "@/components/list";
import { CompanyMessageThread } from "@/components/messaging/company-message-thread";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useThreads,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { format, isToday } from "date-fns";
import { tr } from "date-fns/locale";
import { MessageSquare, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

interface Contact {
  id: string;
  name: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
}

const PORTAL_LABEL: Record<MessagePortal, string> = {
  satinalma: "Satınalma",
  satis: "Satış",
};

/**
 * Portal gelen kutusu — sol kontak listesi (bağlantılar + sohbetler) + sağ
 * sohbet. Satınalma ve Satış inbox'ları birbirinden bağımsızdır (backend
 * thread'i buyer/seller rolüne göre ayırır).
 */
export function CompanyInboxView({ portal }: { portal: MessagePortal }) {
  const connections = useConnections();
  const threads = useThreads(portal);
  const searchParams = useSearchParams();
  const [selected, setSelected] = useState<string | null>(
    searchParams.get("with"),
  );
  const [search, setSearch] = useState("");

  const contacts = useMemo<Contact[]>(() => {
    const threadByOther = new Map(
      (threads.data ?? []).map((t) => [t.otherPartyId, t]),
    );
    const rows: Contact[] = (connections.data ?? []).map((c) => {
      const t = threadByOther.get(c.company.id);
      return {
        id: c.company.id,
        name: c.company.name,
        lastMessagePreview: t?.lastMessagePreview ?? null,
        lastMessageAt: t?.lastMessageAt ?? null,
        unread: t?.unread ?? false,
      };
    });
    // Sohbeti olanlar üstte (son mesaj desc), sonra alfabetik.
    rows.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt)
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name, "tr");
    });
    const q = search.trim().toLocaleLowerCase("tr");
    return q
      ? rows.filter((r) => r.name.toLocaleLowerCase("tr").includes(q))
      : rows;
  }, [connections.data, threads.data, search]);

  const selectedContact = contacts.find((c) => c.id === selected) ?? null;

  return (
    <div className="mx-auto max-w-5xl space-y-6">
      <PageHeader
        title="Mesajlar"
        description={`${PORTAL_LABEL[portal]} konuşmaların — bu portala özel.`}
      />

      <div className="grid h-[calc(100vh-220px)] min-h-[460px] grid-cols-1 overflow-hidden rounded-2xl ring-1 ring-zinc-950/10 sm:grid-cols-[300px_1fr]">
        {/* Sol: kontak listesi */}
        <div
          className={`flex flex-col border-zinc-950/10 bg-white sm:border-r ${
            selected ? "hidden sm:flex" : "flex"
          }`}
        >
          <div className="border-b border-zinc-950/5 p-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Kişi ara…"
                className="w-full rounded-lg border border-surface-border bg-white py-2 pl-9 pr-3 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {connections.isLoading ? (
              <p className="p-4 text-sm text-zinc-500">Yükleniyor…</p>
            ) : contacts.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">
                  Mesajlaşmak için önce bir firmayla bağlantı kur.
                </p>
              </div>
            ) : (
              contacts.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => setSelected(c.id)}
                  className={`flex w-full items-center gap-3 border-b border-zinc-950/5 px-3 py-3 text-left transition hover:bg-zinc-50 ${
                    selected === c.id ? "bg-zinc-50" : ""
                  }`}
                >
                  <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-xs font-semibold text-white">
                    {(c.name[0] ?? "?").toUpperCase()}
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center justify-between gap-2">
                      <span className="truncate text-sm font-semibold text-zinc-900">
                        {c.name}
                      </span>
                      {c.lastMessageAt ? (
                        <span className="shrink-0 text-[10px] text-zinc-400">
                          {isToday(new Date(c.lastMessageAt))
                            ? format(new Date(c.lastMessageAt), "HH:mm")
                            : format(new Date(c.lastMessageAt), "d MMM", {
                                locale: tr,
                              })}
                        </span>
                      ) : null}
                    </div>
                    <div className="flex items-center gap-2">
                      <span className="truncate text-xs text-zinc-500">
                        {c.lastMessagePreview ?? "Yeni sohbet"}
                      </span>
                      {c.unread ? (
                        <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                      ) : null}
                    </div>
                  </div>
                </button>
              ))
            )}
          </div>
        </div>

        {/* Sağ: aktif sohbet */}
        <div className={`min-h-0 ${selected ? "flex" : "hidden sm:flex"} flex-col`}>
          {selectedContact ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="border-b border-zinc-950/5 px-4 py-2 text-left text-xs text-zinc-500 sm:hidden"
              >
                ← Kişiler
              </button>
              <div className="min-h-0 flex-1">
                <CompanyMessageThread
                  portal={portal}
                  otherPartyId={selectedContact.id}
                  otherPartyName={selectedContact.name}
                  bare
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-zinc-50 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-600">
                Bir kişi seç
              </p>
              <p className="mt-1 text-xs text-zinc-400">
                Soldan bir firma seçerek sohbete başla.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
