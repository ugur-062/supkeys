"use client";

import { formatDate } from "@/lib/format-date";
import { PageHeader } from "@/components/list";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { CompanyMessageThread } from "@/components/messaging/company-message-thread";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useThreads,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { canUseMessaging, PORTAL_ORDER } from "@/lib/company/portals";
import { cn } from "@/lib/utils";
import { format, isToday } from "date-fns";
import { tr } from "date-fns/locale";
import { MessageSquare, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

/**
 * BİRLEŞİK gelen kutusu (kullanıcı isteği 2026-08-02): Satınalma + Satış
 * konuşmaları TEK listede, her satırda "Alıcısınız/Satıcısınız" rozeti.
 * Konuşma modeli değişmedi — thread hâlâ (alıcı, satıcı) çifti; aynı firmayla
 * iki yönde iki ayrı konuşma olabilir, rozet farkıyla ayrışır. Rol kapıları
 * aynen: kullanıcı yalnız İŞLEM ROLÜ olan tarafların konuşmalarını görür,
 * composer o tarafın rolünü ister.
 */

interface ThreadRow {
  key: string;
  id: string; // karşı firma id
  name: string;
  /** Konuşmanın tarafı; undefined = henüz konuşulmamış bağlantı. */
  portal: MessagePortal | undefined;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
}

/** "Bu konuşmada ben kimim?" rozeti — satinalma kutusu = ben ALICIYIM. */
const ROLE_CHIP: Record<MessagePortal, { label: string; cls: string }> = {
  satinalma: { label: "Alıcısınız", cls: "bg-blue-50 text-blue-700" },
  satis: { label: "Satıcısınız", cls: "bg-emerald-50 text-emerald-700" },
};

export function CompanyInboxView() {
  const { user } = useCompanyAuth();
  // Kullanıcının mesajlaşabildiği taraflar (işlem rolü olan portallar).
  const myPortals = PORTAL_ORDER.filter((p) =>
    canUseMessaging(user, p),
  );
  const allowed = myPortals.length > 0;
  const connections = useConnections();
  const threads = useThreads("all", allowed);
  const searchParams = useSearchParams();
  const paramPortal = searchParams.get("portal");
  const [selected, setSelected] = useState<{
    id: string;
    portal: MessagePortal;
  } | null>(() => {
    const withId = searchParams.get("with");
    if (!withId) return null;
    const portal: MessagePortal =
      paramPortal === "satis" || paramPortal === "satinalma"
        ? paramPortal
        : (myPortals[0] ?? "satinalma");
    return { id: withId, portal };
  });
  const [search, setSearch] = useState("");

  const rows = useMemo<ThreadRow[]>(() => {
    const threadRows: ThreadRow[] = (threads.data ?? []).map((t) => ({
      key: `${t.portal}:${t.otherPartyId}`,
      id: t.otherPartyId,
      name: t.otherPartyName,
      portal: t.portal,
      lastMessagePreview: t.lastMessagePreview,
      lastMessageAt: t.lastMessageAt,
      unread: t.unread,
    }));
    const threadCompanyIds = new Set(threadRows.map((r) => r.id));
    // Henüz konuşulmamış bağlantılar — yeni sohbet başlatma girişleri
    // (firma başına TEK satır; yön, sohbet panelindeki seçiciyle belirlenir).
    const fresh: ThreadRow[] = (connections.data ?? [])
      .filter((c) => !threadCompanyIds.has(c.company.id))
      .map((c) => ({
        key: `new:${c.company.id}`,
        id: c.company.id,
        name: c.company.name,
        portal: undefined,
        lastMessagePreview: null,
        lastMessageAt: null,
        unread: false,
      }));
    const all = [...threadRows, ...fresh];
    // Sohbeti olanlar üstte (son mesaj desc), sonra alfabetik.
    all.sort((a, b) => {
      if (a.lastMessageAt && b.lastMessageAt)
        return b.lastMessageAt.localeCompare(a.lastMessageAt);
      if (a.lastMessageAt) return -1;
      if (b.lastMessageAt) return 1;
      return a.name.localeCompare(b.name, "tr");
    });
    const q = search.trim().toLocaleLowerCase("tr");
    return q
      ? all.filter((r) => r.name.toLocaleLowerCase("tr").includes(q))
      : all;
  }, [connections.data, threads.data, search]);

  const selectedRowName =
    rows.find((r) => r.id === selected?.id)?.name ??
    (threads.data ?? []).find((t) => t.otherPartyId === selected?.id)
      ?.otherPartyName ??
    null;

  if (!allowed) {
    return (
      <div className="space-y-5">
        <PageHeader
          title="Mesajlar"
          description="Satınalma ve satış konuşmaların — tek kutuda."
        />
        <div className="flex flex-col items-center rounded-xl border border-zinc-950/10 bg-white px-6 py-16 text-center">
          <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="text-sm font-medium text-zinc-700">
            Mesajlaşma için Satın Almacı veya Satışçı rolü gerekir.
          </p>
          <p className="mt-1 max-w-sm text-xs text-zinc-500">
            Bu hesapta operasyon rolü tanımlı değil. Rolleri Ayarlar →
            Kullanıcılar&apos;dan kurucu düzenleyebilir.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Mesajlar"
        description="Satınalma ve satış konuşmalarınız — tek kutuda; her konuşmada hangi tarafta olduğunuz rozetle görünür."
      />

      {/* C44: standart düzen — konuşma listesi SOLDA, sohbet SAĞDA. */}
      <div className="grid h-[calc(100vh-13rem)] min-h-[480px] grid-cols-1 overflow-hidden border-t border-zinc-950/10 sm:grid-cols-[340px_minmax(0,1fr)] lg:grid-cols-[380px_minmax(0,1fr)]">
        {/* Sol: kontak listesi */}
        <div
          className={`flex flex-col border-zinc-950/10 bg-white sm:order-1 sm:border-r ${
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
            {connections.isLoading || threads.isLoading ? (
              <div className="space-y-2 p-3" aria-hidden>
                {Array.from({ length: 5 }).map((_, i) => (
                  <div
                    key={i}
                    className="h-12 animate-pulse rounded-lg bg-zinc-100"
                  />
                ))}
              </div>
            ) : rows.length === 0 ? (
              <div className="flex h-full flex-col items-center justify-center px-6 text-center">
                <MessageSquare className="mb-2 h-8 w-8 text-zinc-300" />
                <p className="text-sm text-zinc-500">
                  Mesajlaşmak için önce bir firmayla bağlantı kur.
                </p>
              </div>
            ) : (
              rows.map((r) => {
                const isActive =
                  selected?.id === r.id &&
                  (r.portal === undefined || selected?.portal === r.portal);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() =>
                      setSelected({
                        id: r.id,
                        // Yeni sohbette varsayılan yön: rolüm olan ilk taraf.
                        portal: r.portal ?? myPortals[0]!,
                      })
                    }
                    className={`flex w-full items-center gap-3 border-l-2 border-b border-zinc-950/5 px-3 py-3 text-left transition hover:bg-zinc-50 ${
                      isActive
                        ? "border-l-brand-600 bg-zinc-100/80"
                        : "border-l-transparent"
                    }`}
                  >
                    <AvatarInitials name={r.name} size="sm" className="mt-0.5" />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="flex min-w-0 items-center gap-2">
                          <span className="truncate text-sm font-semibold text-zinc-900">
                            {r.name}
                          </span>
                          {r.portal ? (
                            <span
                              className={`shrink-0 rounded-full px-1.5 py-0.5 text-xs font-semibold ${ROLE_CHIP[r.portal].cls}`}
                            >
                              {ROLE_CHIP[r.portal].label}
                            </span>
                          ) : null}
                        </span>
                        {r.lastMessageAt ? (
                          <span className="shrink-0 text-xs text-zinc-400">
                            {isToday(new Date(r.lastMessageAt))
                              ? format(new Date(r.lastMessageAt), "HH:mm")
                              : formatDate(r.lastMessageAt, "short")}
                          </span>
                        ) : null}
                      </div>
                      <div className="flex items-center gap-2">
                        <span
                          className="truncate text-xs text-zinc-500"
                          title={r.lastMessagePreview ?? undefined}
                        >
                          {r.lastMessagePreview ?? "Yeni sohbet"}
                        </span>
                        {r.unread ? (
                          <span className="ml-auto h-2 w-2 shrink-0 rounded-full bg-blue-600" />
                        ) : null}
                      </div>
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>

        {/* Sol: aktif sohbet */}
        <div
          className={`min-h-0 sm:order-2 ${selected ? "flex" : "hidden sm:flex"} flex-col`}
        >
          {selected && selectedRowName ? (
            <>
              <button
                type="button"
                onClick={() => setSelected(null)}
                className="border-b border-zinc-950/5 px-4 py-2 text-left text-xs text-zinc-500 sm:hidden"
              >
                ← Kişiler
              </button>
              {/* Bağlam şeridi — bu konuşmada hangi taraftayım? İki rolü olan
                  kullanıcı yönü buradan değiştirebilir (yeni sohbet yönü). */}
              <div className="flex flex-wrap items-center gap-2 border-b border-zinc-950/5 bg-zinc-50/60 px-4 py-2">
                <span className="text-xs text-zinc-600">
                  Bu konuşmada{" "}
                  <strong>
                    {selected.portal === "satinalma"
                      ? "alıcısınız"
                      : "satıcısınız"}
                  </strong>
                  {" — "}
                  {selected.portal === "satinalma"
                    ? `${selectedRowName} size satış yapıyor.`
                    : `${selectedRowName} sizden alım yapıyor.`}
                </span>
                {myPortals.length === 2 ? (
                  <div className="ml-auto flex gap-1 rounded-lg bg-zinc-100 p-0.5">
                    {PORTAL_ORDER.map((p) => (
                      <button
                        key={p}
                        type="button"
                        onClick={() =>
                          setSelected({ id: selected.id, portal: p })
                        }
                        className={cn(
                          "rounded-md px-2 py-0.5 text-xs font-semibold transition",
                          selected.portal === p
                            ? "bg-white shadow-sm " +
                                (p === "satinalma"
                                  ? "text-blue-700"
                                  : "text-emerald-700")
                            : "text-zinc-500 hover:text-zinc-800",
                        )}
                      >
                        {p === "satinalma" ? "Alıcı olarak" : "Satıcı olarak"}
                      </button>
                    ))}
                  </div>
                ) : null}
              </div>
              <div className="min-h-0 flex-1">
                <CompanyMessageThread
                  key={`${selected.portal}:${selected.id}`}
                  portal={selected.portal}
                  otherPartyId={selected.id}
                  otherPartyName={selectedRowName}
                  bare
                />
              </div>
            </>
          ) : (
            <div className="flex h-full flex-col items-center justify-center bg-zinc-50 text-center">
              <MessageSquare className="mb-3 h-10 w-10 text-zinc-300" />
              <p className="text-sm font-medium text-zinc-600">Bir kişi seç</p>
              <p className="mt-1 text-xs text-zinc-400">
                Soldan bir firma seçerek sohbete başlayın.
              </p>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
