"use client";

import { MessageThread } from "@/components/messaging/message-thread";
import { ThreadListItem } from "@/components/messaging/thread-list-item";
import { useAllThreads } from "@/hooks/use-messages";
import type { AllThreadSummary } from "@/lib/messages/types";
import { Loader2, MessageCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

interface SelectedThread {
  threadId: string;
  context: "ORDER" | "TENDER";
  contextRefId: string;
  targetSupplierId?: string;
  otherPartyName: string;
  contextNumber: string;
}

function summaryToSelected(t: AllThreadSummary): SelectedThread {
  return {
    threadId: t.threadId,
    context: t.context,
    contextRefId: t.contextRefId,
    targetSupplierId: t.context === "TENDER" ? t.otherPartyId : undefined,
    otherPartyName: t.otherPartyName,
    contextNumber: t.contextNumber,
  };
}

function MessagesPageInner() {
  const searchParams = useSearchParams();
  const { data: threads, isLoading } = useAllThreads("tenant");
  const [selected, setSelected] = useState<SelectedThread | null>(null);

  // ?thread=<id> query param geldiğinde otomatik seç
  useEffect(() => {
    if (!threads || threads.length === 0) return;
    const threadId = searchParams.get("thread");
    if (threadId) {
      const found = threads.find((t) => t.threadId === threadId);
      if (found) {
        setSelected(summaryToSelected(found));
        return;
      }
    }
    // İlk yüklemede ilk thread'i seç (mobil değilse).
    if (!selected && threads[0]) {
      setSelected(summaryToSelected(threads[0]));
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [threads, searchParams]);

  return (
    <div className="max-w-7xl mx-auto space-y-4">
      <header>
        <h1 className="font-display font-bold text-2xl text-brand-900">
          Mesajlar
        </h1>
        <p className="text-sm text-slate-500 mt-0.5">
          Tedarikçilerinizle olan tüm konuşmalar — sipariş ve ihale içi.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 h-[calc(100vh-220px)] min-h-[500px]">
        <aside className="lg:col-span-4 bg-white border border-slate-200 rounded-2xl overflow-hidden flex flex-col">
          <div className="px-4 py-3 border-b border-slate-200">
            <h3 className="font-bold text-brand-900 text-sm">Konuşmalar</h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {isLoading ? "Yükleniyor…" : `${threads?.length ?? 0} konuşma`}
            </p>
          </div>

          <div className="flex-1 overflow-y-auto p-2 space-y-1">
            {isLoading ? (
              <div className="flex items-center justify-center py-12 text-slate-400">
                <Loader2 className="h-5 w-5 animate-spin" />
              </div>
            ) : !threads || threads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-12 px-4 text-center">
                <div className="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center mb-3">
                  <MessageCircle className="h-5 w-5 text-slate-400" />
                </div>
                <p className="text-sm font-medium text-slate-600">
                  Henüz mesaj yok
                </p>
                <p className="text-xs text-slate-400 mt-1">
                  Sipariş veya ihale detayından bir konuşma başlat
                </p>
              </div>
            ) : (
              threads.map((t) => (
                <ThreadListItem
                  key={t.threadId}
                  thread={t}
                  isActive={selected?.threadId === t.threadId}
                  onClick={() => setSelected(summaryToSelected(t))}
                />
              ))
            )}
          </div>
        </aside>

        <main className="lg:col-span-8">
          {selected ? (
            <MessageThread
              key={selected.threadId}
              surface="tenant"
              context={selected.context}
              contextRefId={selected.contextRefId}
              targetSupplierId={selected.targetSupplierId}
              currentUserType="TENANT_USER"
              headerInfo={{
                otherPartyName: selected.otherPartyName,
                contextNumber: selected.contextNumber,
              }}
              className="h-full !h-full"
            />
          ) : (
            <div className="bg-white border border-slate-200 rounded-2xl flex items-center justify-center h-full">
              <div className="text-center text-slate-400 px-4">
                <MessageCircle className="h-10 w-10 mx-auto mb-3" />
                <p className="text-sm">Soldan bir konuşma seçin</p>
              </div>
            </div>
          )}
        </main>
      </div>
    </div>
  );
}

export default function MessagesPage() {
  return (
    <Suspense
      fallback={
        <div className="flex items-center justify-center py-16">
          <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
        </div>
      }
    >
      <MessagesPageInner />
    </Suspense>
  );
}
