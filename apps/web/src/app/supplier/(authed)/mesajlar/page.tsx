"use client";

import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Input } from "@/components/ui/input";
import { MessageThread } from "@/components/messaging/message-thread";
import { useContacts } from "@/hooks/use-messages";
import type { ContactSummary } from "@/lib/messages/types";
import { format, isToday, isYesterday } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, MessageCircle, Search } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function relativeTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isToday(d)) return format(d, "HH:mm", { locale: tr });
  if (isYesterday(d)) return "Dün";
  return format(d, "d MMM", { locale: tr });
}

function SupplierMessagesPageInner() {
  const { data: contacts, isLoading } = useContacts("supplier");
  const [selected, setSelected] = useState<ContactSummary | null>(null);
  const [search, setSearch] = useState("");
  const searchParams = useSearchParams();

  useEffect(() => {
    if (!contacts || contacts.length === 0) return;
    const targetId = searchParams.get("contact");
    if (targetId && !selected) {
      const match = contacts.find((c) => c.otherPartyId === targetId);
      if (match) {
        setSelected(match);
        return;
      }
    }
    if (!selected) setSelected(contacts[0]!);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contacts, searchParams]);

  const filtered = useMemo(() => {
    if (!contacts) return [];
    const q = search.trim().toLowerCase();
    if (!q) return contacts;
    return contacts.filter((c) =>
      c.otherPartyName.toLowerCase().includes(q),
    );
  }, [contacts, search]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <header>
        <h1 className="font-display font-bold text-2xl text-brand-900">
          Mesajlar
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Bağlantılı alıcı firmalarınızla doğrudan sohbet. Sipariş ve ihale
          içi konuşmalar ilgili detay sayfasından erişilir.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-3 py-3 border-b border-slate-200 space-y-2">
            <h3 className="font-bold text-brand-900 text-sm px-1">
              Alıcı Firmalar
            </h3>
            <div className="relative">
              <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-slate-400 pointer-events-none" />
              <Input
                type="search"
                placeholder="Alıcı ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                className="pl-8 text-sm h-9"
              />
            </div>
            <p className="text-[11px] text-slate-400 px-1">
              {isLoading
                ? "Yükleniyor…"
                : `${filtered.length}${
                    search ? ` / ${contacts?.length ?? 0}` : ""
                  } firma`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !contacts || contacts.length === 0 ? (
              <EmptyState
                title="Bağlantılı alıcı yok"
                hint="Davet kabul ettiğiniz alıcılar burada görünür."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Eşleşen alıcı yok"
                hint="Arama terimini değiştirin."
              />
            ) : (
              filtered.map((c) => (
                <ContactRow
                  key={c.otherPartyId}
                  contact={c}
                  isActive={selected?.otherPartyId === c.otherPartyId}
                  onClick={() => setSelected(c)}
                />
              ))
            )}
          </div>
        </aside>

        <main className="lg:col-span-8">
          {selected ? (
            <MessageThread
              key={selected.otherPartyId}
              surface="supplier"
              context="DIRECT"
              contextRefId={selected.otherPartyId}
              currentUserType="SUPPLIER_USER"
              headerInfo={{
                otherPartyName: selected.otherPartyName,
                contextNumber: "Şirket sohbeti",
              }}
              className="h-full !h-full"
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl flex items-center justify-center h-full">
              <div className="text-center text-slate-400 px-4">
                <MessageCircle className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm">Soldan bir alıcı seçin</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function SupplierMessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <SupplierMessagesPageInner />
    </Suspense>
  );
}

function EmptyState({ title, hint }: { title: string; hint: string }) {
  return (
    <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
      <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
        <MessageCircle className="h-5 w-5 text-slate-400" />
      </div>
      <p className="text-sm font-medium text-slate-600">{title}</p>
      <p className="text-xs text-slate-400 mt-1">{hint}</p>
    </div>
  );
}

function ContactRow({
  contact,
  isActive,
  onClick,
}: {
  contact: ContactSummary;
  isActive: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`w-full text-left p-2.5 rounded-lg border transition-colors ${
        isActive
          ? "border-brand-500 bg-brand-50"
          : "border-transparent hover:bg-slate-50"
      }`}
    >
      <div className="flex items-start gap-2.5">
        <AvatarInitials name={contact.otherPartyName} size="md" />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-brand-900 truncate">
              {contact.otherPartyName}
            </p>
            <span className="text-[10px] text-slate-400 shrink-0">
              {relativeTime(contact.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className={`text-xs truncate ${
                contact.lastMessagePreview
                  ? "text-slate-600"
                  : "text-slate-400 italic"
              }`}
            >
              {contact.lastMessagePreview ?? "Henüz mesaj yok"}
            </p>
            {contact.unread ? (
              <span
                className="bg-danger-500 h-2 w-2 rounded-full shrink-0"
                title="Yeni mesaj"
              />
            ) : null}
          </div>
        </div>
      </div>
    </button>
  );
}
