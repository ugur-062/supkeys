"use client";

import {
  useSendMessage,
  useThreadMessages,
} from "@/hooks/use-messages";
import { useUploadAttachment } from "@/hooks/use-attachments";
import type {
  MessageContext,
  MessageItem,
  MessageSenderType,
  MessageSurface,
} from "@/lib/messages/types";
import { extractErrorMessage } from "@/lib/form-errors";
import { format, isToday, isYesterday } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ClipboardList,
  Loader2,
  Package,
  Paperclip,
  Send,
  X,
} from "lucide-react";
import {
  type KeyboardEvent,
  type ChangeEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { Avatar } from "@/components/catalyst/avatar";
import { Textarea } from "@/components/catalyst/textarea";
import { Button } from "@/components/ui/button";
import { IconButton } from "@/components/ui/icon-button";
import { MessageAttachment } from "./message-attachment";

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

function ThreadChatHeader({
  otherPartyName,
  contextNumber,
}: {
  otherPartyName: string;
  contextNumber: string;
}) {
  return (
    <div className="flex items-center gap-3 border-b border-zinc-950/5 bg-white px-4 py-3">
      <Avatar
        initials={chatInitials(otherPartyName)}
        className="size-10 bg-zinc-900 text-white"
        alt={otherPartyName}
      />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-zinc-950">
          {otherPartyName}
        </p>
        <p className="truncate text-xs text-zinc-500">{contextNumber}</p>
      </div>
    </div>
  );
}

interface Props {
  surface: MessageSurface;
  /** V2-4.2 — Karşı tarafın ID'si (tenant için supplierId, supplier için tenantId). */
  otherPartyId: string;
  /** Gönderilen yeni mesajlara otomatik etiketlenecek context (örn. tender
   * detayından açılan dialog için TENDER+tenderId). */
  defaultContext?: { context: MessageContext; contextRefId?: string };
  /** Mesaj balonlarında "ben" tarafını belirler. */
  currentUserType: MessageSenderType;
  /** Opsiyonel chat-header (avatar + ad + bağlam). */
  headerInfo?: {
    otherPartyName: string;
    contextNumber: string;
  };
  className?: string;
  /** Kenarlıksız mod — bir panel içine gömüldüğünde (inbox) ring/rounded olmadan dolar. */
  bare?: boolean;
}

interface PendingAttachment {
  id: string;
  name: string;
  size: number;
}

export function MessageThread({
  surface,
  otherPartyId,
  defaultContext,
  currentUserType,
  headerInfo,
  className,
  bare = false,
}: Props) {
  const { data, isLoading } = useThreadMessages(surface, otherPartyId);
  const sendMutation = useSendMessage(surface, otherPartyId, defaultContext);
  const uploadMutation = useUploadAttachment(surface);

  const [content, setContent] = useState("");
  const [pending, setPending] = useState<PendingAttachment[]>([]);
  const [uploadingCount, setUploadingCount] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [data?.messages.length]);

  const messages = data?.messages ?? [];

  const handleSend = async () => {
    const trimmed = content.trim();
    if (!trimmed && pending.length === 0) return;
    if (uploadingCount > 0) {
      toast.error("Dosya yüklemesi tamamlansın");
      return;
    }
    try {
      await sendMutation.mutateAsync({
        content: trimmed,
        attachmentIds: pending.map((p) => p.id),
      });
      setContent("");
      setPending([]);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Mesaj gönderilemedi"));
    }
  };

  const handleFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(e.target.files ?? []);
    e.target.value = "";
    if (files.length === 0) return;

    const slotsLeft = 5 - pending.length;
    if (files.length > slotsLeft) {
      toast.error(`Mesaj başına en fazla 5 dosya (${slotsLeft} kaldı)`);
      return;
    }

    setUploadingCount((n) => n + files.length);
    for (const file of files) {
      try {
        const result = await uploadMutation.mutateAsync({
          scope: "MESSAGE_ATTACHMENT",
          scopeRefId: otherPartyId,
          file,
        });
        setPending((prev) => [
          ...prev,
          { id: result.id, name: file.name, size: file.size },
        ]);
      } catch {
        // Hata toast'ı interceptor + form-errors zaten gösterir
      } finally {
        setUploadingCount((n) => n - 1);
      }
    }
  };

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      void handleSend();
    }
  };

  // V2-4.2 — Yükseklik viewport-relative + max cap. Parent constraint yoksa
  // bile MessageThread kendi içine sığar; mesaj artışında SAYFA değil
  // mesaj listesi scroll eder. className ile override edilebilir.
  const wrapperCls = bare
    ? "flex flex-col h-full min-h-0 bg-white overflow-hidden"
    : "flex flex-col h-[calc(100vh-200px)] max-h-[700px] min-h-[400px] bg-white ring-1 ring-zinc-950/5 rounded-2xl overflow-hidden";

  if (isLoading) {
    return (
      <div className={`${wrapperCls} items-center justify-center ${className ?? ""}`}>
        <Loader2 className="h-6 w-6 animate-spin text-zinc-400" />
      </div>
    );
  }

  return (
    <div className={`${wrapperCls} ${className ?? ""}`}>
      {headerInfo ? (
        <ThreadChatHeader
          otherPartyName={headerInfo.otherPartyName}
          contextNumber={headerInfo.contextNumber}
        />
      ) : null}

      {defaultContext && defaultContext.context !== "DIRECT" ? (
        <div className="px-3 py-1.5 bg-zinc-50 border-b border-zinc-200">
          <p className="text-[11px] text-zinc-500">
            Bu sohbete gönderdiğin yeni mesajlar otomatik olarak{" "}
            <span className="font-medium text-zinc-700">
              {defaultContext.context === "TENDER" ? "ihale" : "sipariş"}
            </span>{" "}
            etiketi alır.
          </p>
        </div>
      ) : null}

      {/* Mesaj listesi */}
      <div className="flex-1 overflow-y-auto px-4 py-4 bg-zinc-50">
        {messages.length === 0 ? (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <div className="w-12 h-12 rounded-full bg-zinc-200 flex items-center justify-center mb-3">
              <Send className="h-5 w-5 text-zinc-400" />
            </div>
            <p className="text-sm font-medium text-zinc-600">
              Henüz mesaj yok
            </p>
            <p className="text-xs text-zinc-400 mt-1">
              İlk mesajı sen gönder
            </p>
          </div>
        ) : (
          <MessageList
            messages={messages}
            currentUserType={currentUserType}
            surface={surface}
          />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Pending attachments */}
      {(pending.length > 0 || uploadingCount > 0) && (
        <div className="px-3 py-2 bg-zinc-50 border-t border-zinc-200 flex flex-wrap items-center gap-2">
          {pending.map((p) => (
            <div
              key={p.id}
              className="flex items-center gap-1.5 bg-white px-2 py-1 rounded-md border border-zinc-200 text-xs"
            >
              <Paperclip className="h-3 w-3 text-zinc-500" />
              <span className="truncate max-w-[160px]">{p.name}</span>
              <button
                type="button"
                onClick={() =>
                  setPending((prev) => prev.filter((x) => x.id !== p.id))
                }
                className="text-zinc-400 hover:text-danger-500"
                aria-label="Kaldır"
              >
                <X className="h-3 w-3" />
              </button>
            </div>
          ))}
          {uploadingCount > 0 && (
            <div className="flex items-center gap-1.5 text-xs text-zinc-500">
              <Loader2 className="h-3 w-3 animate-spin" />
              {uploadingCount} dosya yükleniyor…
            </div>
          )}
        </div>
      )}

      {/* Input */}
      <div className="border-t border-zinc-200 px-3 py-3 bg-white">
        <div className="flex items-end gap-2">
          <IconButton
            onClick={() => fileInputRef.current?.click()}
            disabled={pending.length >= 5 || uploadingCount > 0}
            title="Dosya ekle"
            aria-label="Dosya ekle"
          >
            <Paperclip className="h-5 w-5" />
          </IconButton>
          <input
            ref={fileInputRef}
            type="file"
            multiple
            className="hidden"
            onChange={handleFiles}
          />
          <div className="flex-1">
            <Textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKey}
              placeholder="Mesaj yaz… (Enter: gönder, Shift+Enter: yeni satır)"
              resizable={false}
              rows={1}
              className="max-h-32 [&_textarea]:py-2"
            />
          </div>
          <Button
            type="button"
            onClick={() => void handleSend()}
            disabled={
              sendMutation.isPending ||
              uploadingCount > 0 ||
              (!content.trim() && pending.length === 0)
            }
            loading={sendMutation.isPending}
            aria-label="Gönder"
          >
            {sendMutation.isPending ? null : <Send className="h-4 w-4" />}
          </Button>
        </div>
      </div>
    </div>
  );
}

function formatTimestamp(date: Date): string {
  if (isToday(date)) return format(date, "HH:mm", { locale: tr });
  if (isYesterday(date)) return `Dün ${format(date, "HH:mm", { locale: tr })}`;
  return format(date, "d MMM HH:mm", { locale: tr });
}

function MessageContextChip({ msg }: { msg: MessageItem }) {
  if (!msg.context || msg.context === "DIRECT") return null;
  const label = msg.contextLabel ?? (msg.context === "TENDER" ? "İhale" : "Sipariş");
  const isOrder = msg.context === "ORDER";
  return (
    <span
      className={`inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md text-[10px] font-semibold mb-1 ${
        isOrder
          ? "bg-success-50 text-success-700"
          : "bg-zinc-50 text-zinc-700"
      }`}
    >
      {isOrder ? (
        <Package className="h-2.5 w-2.5" />
      ) : (
        <ClipboardList className="h-2.5 w-2.5" />
      )}
      {label}
    </span>
  );
}

function MessageList({
  messages,
  currentUserType,
  surface,
}: {
  messages: MessageItem[];
  currentUserType: MessageSenderType;
  surface: MessageSurface;
}) {
  return (
    <div className="space-y-2">
      {messages.map((msg) => {
        const isMine = msg.senderType === currentUserType;
        const sentAt = new Date(msg.sentAt);
        return (
          <div
            key={msg.id}
            className={`flex ${isMine ? "justify-end" : "justify-start"}`}
          >
            <div
              className={`max-w-[75%] flex flex-col ${isMine ? "items-end" : "items-start"}`}
            >
              {!isMine ? (
                <div className="text-[11px] text-zinc-500 mb-0.5 ml-2">
                  {msg.senderName}
                </div>
              ) : null}
              <MessageContextChip msg={msg} />
              <div
                className={`rounded-2xl px-3.5 py-2 ${
                  isMine
                    ? "bg-zinc-900 text-white rounded-br-sm"
                    : "bg-white text-zinc-900 ring-1 ring-zinc-950/5 rounded-bl-sm"
                }`}
              >
                {msg.content ? (
                  <p className="text-sm whitespace-pre-wrap break-words leading-snug">
                    {msg.content}
                  </p>
                ) : null}
                {msg.attachmentIds.length > 0 ? (
                  <div
                    className={`${
                      msg.content ? "mt-2 pt-2 border-t" : ""
                    } ${isMine ? "border-white/20" : "border-zinc-100"} space-y-1`}
                  >
                    {msg.attachmentIds.map((attId) => (
                      <MessageAttachment
                        key={attId}
                        attachmentId={attId}
                        isMine={isMine}
                        surface={surface}
                      />
                    ))}
                  </div>
                ) : null}
              </div>
              <div
                className={`text-[10px] text-zinc-400 mt-0.5 ${isMine ? "mr-2" : "ml-2"}`}
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
