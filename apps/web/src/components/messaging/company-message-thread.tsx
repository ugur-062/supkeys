"use client";

import { useLocale, useTranslations } from "next-intl";
import { useRoleLabel } from "@/i18n/domain";
import { formatDate } from "@/lib/format-date";
import { canSendMessages, messagingDirectionOpen } from "@/lib/company/portals";
import { buyingGate, gateHref } from "@/lib/public/member-gate";
import { Link } from "@/i18n/navigation";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import {
  useSendMessage,
  useThreadMessages,
  type ChatMessage,
  type MessagePortal,
} from "@/hooks/use-company-messages";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format, isToday, isYesterday } from "date-fns";
import { Loader2, Lock, Send } from "lucide-react";
import {
  type KeyboardEvent,
  useEffect,
  useRef,
  useState,
} from "react";
import { toast } from "sonner";
import { useSubmitLock } from "@/hooks/use-submit-lock";

/**
 * Mesaj zamanı — bugün "HH:mm", dün "Dün HH:mm", eskisi tarih + saat okuyucunun
 * dilinde (`formatDate`). Bugün/dün ayrımı tarayıcı gününe göre (sohbet yalnız istemcide çizilir).
 */
function useFormatTimestamp(): (date: Date) => string {
  const t = useTranslations("web.panel.inbox.companyMessageThread");
  const locale = useLocale();
  return (date) => {
    if (isToday(date)) return format(date, "HH:mm");
    if (isYesterday(date)) return t("dun", { time: format(date, "HH:mm") });
    return formatDate(date, "datetime", locale);
  };
}

/** Mesaj gövdesi tavanı — API `SendMessageDto` `@MaxLength(5000)` aynası (D-356). */
export const MESSAGE_MAX_LENGTH = 5000;
/** Sayaç bu uzunluktan sonra görünür (kısa mesajda gürültü olmasın). */
const COUNTER_FROM = 4000;

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
  const t = useTranslations("web.panel.inbox.companyMessageThread");
  const roleLabel = useRoleLabel();
  const { data, isLoading } = useThreadMessages(portal, otherPartyId);
  const sendMutation = useSendMessage(portal, otherPartyId);
  // F7: gönderme portal-yönlü işlem rolü ister (backend send() birebir:
  // satinalma→Satın Almacı, satis→Satışçı) — rolsüz okur, composer gizli.
  // O-123: alıcı yönü ayrıca Gold ister (paket kapısı rolün DIŞINDA): paketi
  // düşen firma eski konuşmayı okur, composer yerine doğru CTA'yı görür
  // (doğrulanmamışsa önce doğrulama, değilse Gold'a geçiş).
  const { user, company } = useCompanyAuth();
  // Süren sipariş istisnası (sunucu bildirir): paketi düşen alıcı o
  // satıcıya yazmaya devam eder — Gold çağrısı gösterilmez.
  const sendOpenByOrder = data?.sendOpenByOrder === true;
  const tierOpen =
    messagingDirectionOpen(portal, company?.tier) || sendOpenByOrder;
  const tierGate = tierOpen ? null : buyingGate(user, company, "listing");
  const tierGateHref = tierGate ? gateHref(tierGate) : null;
  const canSend = canSendMessages(
    user,
    portal,
    company?.tier,
    sendOpenByOrder,
  );

  const [content, setContent] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const messages = data?.messages ?? [];

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length]);

  // Enter'a art arda basmak / çift tık aynı mesajı iki kez göndermesin
  // (arayüz testi FX-00 D-067, O-031).
  const sendLock = useSubmitLock();
  const handleSend = () =>
    sendLock.run(async () => {
      const trimmed = content.trim();
      if (!trimmed) return;
      try {
        await sendMutation.mutateAsync(trimmed);
        setContent("");
      } catch (err) {
        toast.error(extractErrorMessage(err, t("mesajGonderilemedi")));
      }
    });

  const onKey = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    // IME bileşimi (Japonca/Çince vb. aday seçimi) Enter'ı onaylamak için
    // kullanır — o Enter mesajı GÖNDERMEZ (arayüz testi D-356).
    if (e.nativeEvent.isComposing || e.keyCode === 229) return;
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
        <AvatarInitials name={otherPartyName} size="md" />
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
            <p className="text-sm font-medium text-zinc-600">{t("henuzMesajYok")}</p>
            <p className="mt-1 text-xs text-zinc-400">{t("ilkMesajiSenGonder")}</p>
          </div>
        ) : (
          <MessageList messages={messages} />
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input — paket (alıcı yönü Gold) + portal-yönlü işlem rolü */}
      {tierGate && tierGateHref ? (
        <div
          role="note"
          className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-amber-200 bg-amber-50 px-4 py-3 text-xs text-amber-900"
        >
          <Lock aria-hidden className="size-3.5 shrink-0" />
          <span className="min-w-0 flex-1">{t("aliciYonuGoldGerektirir")}</span>
          <Link
            href={tierGateHref}
            className="shrink-0 font-semibold underline underline-offset-2 hover:text-amber-950"
          >
            {tierGate === "verify" ? t("onceUcretsizDogrulan") : t("goldaGec")}
          </Link>
        </div>
      ) : !canSend ? (
        <div className="border-t border-zinc-200 bg-zinc-50 px-4 py-3 text-xs text-zinc-500">
          {t("mesajGondermekRoluGerektirir", { role: roleLabel(portal === "satis" ? "SATISCI" : "SATIN_ALMACI") })}
        </div>
      ) : (
      <div className="border-t border-zinc-200 bg-white px-3 py-3">
        <div className="flex items-end gap-2">
          <div className="flex-1">
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              onKeyDown={onKey}
              maxLength={MESSAGE_MAX_LENGTH}
              // Kısa yer tutucu (D-008): uzun "Enter/Shift+Enter" metni 390 px'te
              // iki satıra bölünüp kesiliyordu; klavye ipucu yalnız geniş ekranda alt satırda.
              placeholder={t("mesajYaz")}
              aria-describedby="company-message-enter-hint"
              rows={1}
              className="max-h-32 w-full resize-none rounded-lg border border-surface-border bg-white px-3.5 py-2 text-sm shadow-sm focus:outline-none focus:ring-2 focus:ring-zinc-900/10"
            />
          </div>
          <button
            type="button"
            onClick={() => void handleSend()}
            disabled={sendMutation.isPending || sendLock.locked || !content.trim()}
            className="inline-flex h-9 items-center justify-center rounded-lg bg-zinc-900 px-4 text-white transition-colors hover:bg-zinc-800 disabled:opacity-50"
            aria-label={t("gonder")}
          >
            {sendMutation.isPending || sendLock.locked ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Send className="h-4 w-4" />
            )}
          </button>
        </div>
        <div className="mt-1 flex items-center justify-between gap-2 px-0.5">
          <p id="company-message-enter-hint" className="hidden text-xs text-zinc-500 sm:block">
            {t("enterIpucu")}
          </p>
          {content.length >= COUNTER_FROM ? (
            <span
              className={`ml-auto text-xs tabular-nums ${
                content.length >= MESSAGE_MAX_LENGTH ? "text-rose-700" : "text-zinc-500"
              }`}
            >
              {t("karakterSayaci", { n: content.length, max: MESSAGE_MAX_LENGTH })}
            </span>
          ) : null}
        </div>
      </div>
      )}
    </div>
  );
}

function MessageList({ messages }: { messages: ChatMessage[] }) {
  const formatTimestamp = useFormatTimestamp();
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
                <div className="mb-0.5 ml-2 text-xs text-zinc-500">
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
                className={`mt-0.5 text-xs text-zinc-400 ${isMine ? "mr-2" : "ml-2"}`}
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
