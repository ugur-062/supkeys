"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import {
  useSendMessage,
  useThreadMessages,
  type ChatMessage,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format, isToday, isYesterday } from "date-fns";
import { tr } from "date-fns/locale";
import { Loader2, Send } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";

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

function formatTimestamp(date: Date): string {
  if (isToday(date)) return format(date, "HH:mm", { locale: tr });
  if (isYesterday(date)) return `Dün ${format(date, "HH:mm", { locale: tr })}`;
  return format(date, "d MMM HH:mm", { locale: tr });
}

interface Props {
  portal: MessagePortal;
  otherPartyId: string;
  otherPartyName: string;
  /** Kenarlıksız mod — inbox paneline gömülünce ring/rounded olmadan dolar. */
  bare?: boolean;
}

/**
 * 1-1 sohbet — eski Messenger-tarzı balon/composer'ın birebir görseli, yeni
 * company-messages modeline bağlı. Mesaj 5s polling ile canlı yenilenir.
 */
export function CompanyMessageThread({
  portal,
  otherPartyId,
  otherPartyName,
  bare = false,
}: Props) {
  const { data, isLoading } = useThreadMessages(portal, otherPartyId);
  const sendMutation = useSendMessage(portal, otherPartyId);
  // F7: gönderme portal-yönlü işlem rolü ister (backend send() birebir:
  // satinalma→Satın Almacı, satis→Satışçı) — rolsüz okur, composer gizli.
  const { user } = useCompanyAuth();
  const canSend = (user?.roles ?? []).includes(
    portal === "satis" ? "SATISCI" : "SATIN_ALMACI",
  );

  const [content, setContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = data?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed) return;
    try {
      await sendMutation.mutateAsync(trimmed);
      setContent("");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Mesaj gönderilemedi"));
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  const wrapperCls = bare
    ? "flex flex-col h-full min-h-0 bg-white overflow-hidden"
    : "flex flex-col h-[calc(100vh-200px)] max-h-[700px] min-h-[400px] bg-white ring-1 ring-zinc-950/5 rounded-2xl overflow-hidden";

  if (isLoading) {
    return (
      <div className={`${wrapperCls} items-center justify-center`}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className={wrapperCls}>
      {/* Chat header */}
      <div className="flex items-center gap-3 border-b border-zinc-950/5 bg-white px-4 py-3">
        <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-zinc-900 text-sm font-semibold text-white">
          {chatInitials(otherPartyName)}
        </div>
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-zinc-950">
            {otherPartyName}
          </p>
        </div>
      </div>

      {/* Mesaj listesi */}
      <div className="flex-1 overflow-y-auto bg-zinc-50 px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center text-center">
            <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-full bg-zinc-200">
              <Send className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-600">Henüz mesaj yok</p>
            <p className="mt-1 text-xs text-zinc-400">İlk mesajı sen gönder</p>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — yalnız portal-yönlü işlem rolüne görünür */}
      {!canSend ? (
        <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          Mesaj göndermek {portal === "satis" ? "Satışçı" : "Satın Almacı"}{" "}
          rolü gerektirir — konuşmayı görüntülüyorsunuz.
        </div>
      ) : (
      <div className="border-t border-zinc-200 bg-white px-3 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKey}
              placeholder="Mesaj yaz… (Enter: gönder, Shift+Enter: yeni satır)"
              rows={1}
              className="max-h-32 w-full resize-none rounded-lg border border-surface-border bg-white px-3.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sendMutation.isPending || !content.trim()}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            aria-label="Gönder"
          >
            {sendMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
      </div>
      )}
    </div>
  );
}

function MessageList({ messages }: { messages: ChatMessage[] }) {
  return (
    <div className="space-y-2">
      {messages.map((msg) => {
        const isMine = msg.mine;
        const sentAt = new Date(msg.createdAt);
        return (
          <div
            key={msg.id}
            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`flex max-w-[75%] flex-col ${isMine ? "items-end" : "items-start"}`}
            >
              {!isMine ? (
                <div className="mb-0.5 ml-2 text-[11px] text-zinc-500">
                  {msg.senderName}
                </div>
              ) : null}
              <div
                className={`rounded-2xl px-3.5 py-2 ${
                  isMine
                    ? "rounded-br-sm bg-zinc-900 text-white"
                    : "rounded-bl-sm bg-white text-zinc-900 ring-1 ring-zinc-950/5"
                }`}
              >
                <p className="whitespace-pre-wrap break-words text-sm leading-snug">
                  {msg.body}
                </p>
              </div>
              <div
                className={`mt-0.5 text-[10px] text-zinc-400 ${isMine ? "mr-2" : "ml-2"}`}
              >
                {formatTimestamp(sentAt)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
