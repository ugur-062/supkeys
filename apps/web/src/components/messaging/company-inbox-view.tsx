"use client";

import { PageHeader } from "@/components/list";
import { CompanyMessageThread } from "@/components/messaging/company-message-thread";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useThreads,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { canUseMessaging } from "@/lib/company/portals";
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
  const { user } = useCompanyAuth();
  // Rol kapısı: portalın işlem rolü yoksa (Kurucu/Yönetici dahil) gelen
  // kutusu açılmaz — API okuma uçları da 403 verir, sorgular hiç atılmaz.
  const allowed = canUseMessaging(user?.roles ?? [], portal);
  const connections = useConnections();
  const threads = useThreads(portal, allowed);
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

  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Mesajlar"
          description={`${PORTAL_LABEL[portal]} konuşmaların — bu portala özel.`}
        />
        <div className="flex flex-col items-center rounded-xl border border-zinc-950/10 bg-white px-6 py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-700">
            Mesajlaşma için{" "}
            {portal === "satinalma" ? "Satın Almacı" : "Satışçı"} rolü gerekir.
          </p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            Bu portalda mesajlaşabilmek için hesabına ilgili operasyon rolünün
            tanımlanması gerekiyor. Rolleri Ayarlar → Kullanıcılar&apos;dan
            kurucu düzenleyebilir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mesajlar"
        description={`${PORTAL_LABEL[portal]} konuşmaların — bu portala özel.`}
      />

      <div className="grid h-[calc(100vh-13rem)] min-h-[480px] grid-cols-1 overflow-hidden border-t border-zinc-950/10 sm:grid-cols-[minmax(0,1fr)_340px] lg:grid-cols-[minmax(0,1fr)_380px]">
        {/* Sağ: kontak listesi (şirket arama) */}
        <div
          className={`flex flex-col border-zinc-950/10 bg-white sm:order-2 sm:border-l ${
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
              <div className="space-y-2 p-3" aria-hidden>
              {Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="h-12 animate-pulse rounded-lg bg-zinc-100" />
              ))}
            </div>
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
                  className={`flex w-full items-center gap-3 border-l-2 border-b border-zinc-950/5 px-3 py-3 text-left transition hover:bg-zinc-50 ${
                    selected === c.id
                      ? "border-l-brand-600 bg-brand-50/60"
                      : "border-l-transparent"
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

        {/* Sol: aktif sohbet */}
        <div
          className={`min-h-0 sm:order-1 ${selected ? "flex" : "hidden sm:flex"} flex-col`}
        >
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
                Sağdan bir firma seçerek sohbete başla.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
