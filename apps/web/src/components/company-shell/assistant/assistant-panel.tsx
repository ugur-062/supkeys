"use client";

import { useAiUsage } from "@/hooks/use-ai-usage";
import {
  useAssistantSession,
  useAssistantSessions,
  useDeleteAssistantSession,
  useSendAssistantMessage,
} from "@/hooks/use-ai-assistant";
import { cn } from "@/lib/utils";
import type { AiChatMessageDto } from "@rothern/shared";
import { Loader2, Plus, Send, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";

interface LocalMsg {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
}

/** Faz AI-2 — asistan sohbet gövdesi (balonlar + composer + oturum listesi). */
export function AssistantPanel() {
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState("");
  const [showHistory, setShowHistory] = useState(false);
  const [suggestNew, setSuggestNew] = useState(false);

  const sessions = useAssistantSessions(true);
  const loaded = useAssistantSession(sessionId);
  const send = useSendAssistantMessage();
  const del = useDeleteAssistantSession();
  const usage = useAiUsage();
  const endRef = useRef<HTMLDivElement>(null);

  // Var olan oturuma geçince geçmişi yükle.
  useEffect(() => {
    if (loaded.data) {
      setMessages(
        loaded.data.messages.map((m: AiChatMessageDto) => ({
          id: m.id,
          role: m.role,
          content: m.content,
        })),
      );
    }
  }, [loaded.data]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, send.isPending]);

  const quotaFull = usage.data?.enabled === false ? false : (usage.data?.percentUsed ?? 0) >= 100;

  const startNew = () => {
    setSessionId(null);
    setMessages([]);
    setSuggestNew(false);
    setShowHistory(false);
  };

  const submit = async () => {
    const text = input.trim();
    if (!text || send.isPending) return;
    setInput("");
    const optimisticId = `local-${messages.length}`;
    setMessages((m) => [...m, { id: optimisticId, role: "USER", content: text }]);
    try {
      const reply = await send.mutateAsync({
        sessionId: sessionId ?? undefined,
        message: text,
      });
      setSessionId(reply.sessionId);
      setSuggestNew(reply.suggestNewChat);
      setMessages((m) => [
        ...m,
        { id: `a-${m.length}`, role: "ASSISTANT", content: reply.reply },
      ]);
    } catch {
      setMessages((m) => [
        ...m,
        {
          id: `err-${m.length}`,
          role: "ASSISTANT",
          content: "Şu an yanıt veremedim — lütfen tekrar deneyin.",
        },
      ]);
    }
  };

  return (
    <div className="flex h-full flex-col">
      {/* Üst bar: yeni sohbet + geçmiş + kullanım */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-950/10 px-4 py-3">
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-950"
        >
          <Plus className="h-4 w-4" /> Yeni sohbet
        </button>
        <div className="flex items-center gap-3">
          {usage.data && usage.data.enabled !== false ? (
            <span className="text-xs text-zinc-400">
              AI: %{usage.data.percentUsed.toLocaleString("tr-TR")}
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            className="text-sm text-zinc-500 hover:text-zinc-900"
          >
            Geçmiş
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="max-h-48 overflow-y-auto border-b border-zinc-950/10">
          {(sessions.data ?? []).length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-400">Kayıtlı sohbet yok</p>
          ) : (
            (sessions.data ?? []).map((s) => (
              <div
                key={s.id}
                className="flex items-center gap-2 px-4 py-2 hover:bg-zinc-50"
              >
                <button
                  type="button"
                  onClick={() => {
                    setSessionId(s.id);
                    setShowHistory(false);
                  }}
                  className="min-w-0 flex-1 truncate text-left text-sm text-zinc-700"
                >
                  {s.title ?? "Sohbet"}
                </button>
                <button
                  type="button"
                  aria-label="Sohbeti sil"
                  onClick={() => {
                    void del.mutateAsync(s.id);
                    if (sessionId === s.id) startNew();
                  }}
                  className="text-zinc-300 hover:text-red-600"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            ))
          )}
        </div>
      ) : null}

      {/* Balonlar */}
      <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="pt-8 text-center text-sm text-zinc-400">
            <p className="font-medium text-zinc-600">Rothern Asistanı</p>
            <p className="mt-1">
              "Açık ihaleleri göster", "son siparişlerim", "3 numaralı ihalenin
              durumu" gibi sorular sorun. Asistan yalnız firmanızın görebildiği
              veriyi getirir; işlem yapmaz, yönlendirir.
            </p>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "flex",
                m.role === "USER" ? "justify-end" : "justify-start",
              )}
            >
              <div
                className={cn(
                  "max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3.5 py-2 text-sm",
                  m.role === "USER"
                    ? "bg-zinc-900 text-white"
                    : "bg-zinc-100 text-zinc-900",
                )}
              >
                {m.content}
              </div>
            </div>
          ))
        )}
        {send.isPending ? (
          <div className="flex justify-start">
            <div className="flex items-center gap-2 rounded-2xl bg-zinc-100 px-3.5 py-2 text-sm text-zinc-500">
              <Loader2 className="h-4 w-4 animate-spin" /> Düşünüyorum…
            </div>
          </div>
        ) : null}
        <div ref={endRef} />
      </div>

      {suggestNew ? (
        <p className="border-t border-zinc-950/10 bg-zinc-50 px-4 py-2 text-xs text-zinc-500">
          Bu sohbet uzadı — daha iyi sonuç için yeni bir sohbet başlatabilirsiniz.
        </p>
      ) : null}

      {/* Composer */}
      <div className="border-t border-zinc-950/10 p-3">
        {quotaFull ? (
          <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">
            Aylık AI bütçeniz doldu — ay sonunda yenilenir.
          </p>
        ) : (
          <div className="flex items-end gap-2">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void submit();
                }
              }}
              rows={1}
              placeholder="Bir şey sorun…"
              disabled={send.isPending}
              className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-950/10 px-3 py-2 text-sm focus:border-zinc-400 focus:outline-none"
            />
            <button
              type="button"
              onClick={() => void submit()}
              disabled={send.isPending || !input.trim()}
              aria-label="Gönder"
              className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-zinc-900 text-white disabled:opacity-40"
            >
              <Send className="h-4 w-4" />
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
