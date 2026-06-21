"use client";

import { Avatar } from "@/components/catalyst/avatar";
import { Input, InputGroup } from "@/components/catalyst/input";
import { PageHeader } from "@/components/list";
import { MessageThread } from "@/components/messaging/message-thread";
import { useContacts } from "@/hooks/use-messages";
import type { ContactSummary } from "@/lib/messages/types";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { format, isToday, isYesterday } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, MessageCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";

function relativeTime(value: string | null): string {
  if (!value) return "";
  const d = new Date(value);
  if (isToday(d)) return format(d, "HH:mm", { locale: tr });
  if (isYesterday(d)) return "Dün";
  return format(d, "d MMM", { locale: tr });
}

function chatInitials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((w) => w[0])
      .join("")
      .toUpperCase() || "?"
  );
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
      <PageHeader
        title="Mesajlar"
        description="Bağlantılı müşteri firmalarınızla doğrudan sohbet. Sipariş ve ihale içi konuşmalar ilgili detay sayfasından erişilir."
      />

      {/* Birleşik inbox paneli — desktop'ta tek panel + iç ayraç, mobilde istiflenmiş */}
      <div className="flex flex-col gap-4 lg:h-[calc(100vh-220px)] lg:min-h-[520px] lg:flex-row lg:gap-0 lg:overflow-hidden lg:rounded-2xl lg:bg-white lg:shadow-sm lg:ring-1 lg:ring-zinc-950/5">
        {/* Sağ: kişi listesi (arama burada) */}
        <aside className="flex h-[55vh] flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 lg:order-2 lg:h-auto lg:w-80 lg:shrink-0 lg:rounded-none lg:border-l lg:border-zinc-950/5 lg:shadow-none lg:ring-0">
          <div className="space-y-2 border-b border-zinc-950/5 p-3">
            <InputGroup>
              <MagnifyingGlassIcon data-slot="icon" />
              <Input
                type="search"
                placeholder="Müşteri ara…"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
              />
            </InputGroup>
            <p className="px-1 text-[11px] text-zinc-400">
              {isLoading
                ? "Yükleniyor…"
                : `${filtered.length}${
                    search ? ` / ${contacts?.length ?? 0}` : ""
                  } müşteri`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-zinc-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !contacts || contacts.length === 0 ? (
              <EmptyState
                title="Bağlantılı müşteri yok"
                hint="Davet kabul ettiğiniz müşteriler burada görünür."
              />
            ) : filtered.length === 0 ? (
              <EmptyState
                title="Eşleşen müşteri yok"
                hint="Arama terimini değiştirin."
              />
            ) : (
              <div className="space-y-0.5">
                {filtered.map((c) => (
                  <ContactRow
                    key={c.otherPartyId}
                    contact={c}
                    isActive={selected?.otherPartyId === c.otherPartyId}
                    onClick={() => setSelected(c)}
                  />
                ))}
              </div>
            )}
          </div>
        </aside>

        {/* Sol: sohbet */}
        <main className="flex min-h-[440px] flex-1 flex-col overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 lg:order-1 lg:min-h-0 lg:rounded-none lg:shadow-none lg:ring-0">
          {selected ? (
            <MessageThread
              key={selected.otherPartyId}
              bare
              surface="supplier"
              otherPartyId={selected.otherPartyId}
              currentUserType="SUPPLIER_USER"
              headerInfo={{
                otherPartyName: selected.otherPartyName,
                contextNumber: "Tüm konuşma",
              }}
            />
          ) : (
            <div className="flex flex-1 items-center justify-center">
              <div className="px-4 text-center text-zinc-400">
                <MessageCircle className="mx-auto mb-3 h-10 w-10" />
                <p className="text-sm">Soldan bir müşteri seçin</p>
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
          <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
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
      <div className="w-12 h-12 rounded-full bg-zinc-100 flex items-center justify-center mb-3">
        <MessageCircle className="h-5 w-5 text-zinc-400" />
      </div>
      <p className="text-sm font-medium text-zinc-600">{title}</p>
      <p className="text-xs text-zinc-400 mt-1">{hint}</p>
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
      className={`w-full rounded-lg p-2.5 text-left transition-colors ${
        isActive ? "bg-zinc-100" : "hover:bg-zinc-50"
      }`}
    >
      <div className="flex items-start gap-3">
        <Avatar
          initials={chatInitials(contact.otherPartyName)}
          className="size-10 bg-zinc-900 text-white"
          alt={contact.otherPartyName}
        />
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2">
            <p className="font-semibold text-sm text-zinc-900 truncate">
              {contact.otherPartyName}
            </p>
            <span className="text-[10px] text-zinc-400 shrink-0">
              {relativeTime(contact.lastMessageAt)}
            </span>
          </div>
          <div className="flex items-center justify-between gap-2 mt-0.5">
            <p
              className={`text-xs truncate ${
                contact.lastMessagePreview
                  ? "text-zinc-600"
                  : "text-zinc-400 italic"
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
