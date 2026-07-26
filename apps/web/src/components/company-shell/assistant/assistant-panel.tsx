"use client";

import { useAiUsage } from "@/hooks/use-ai-usage";
import {
  useAssistantSession,
  useAssistantSessions,
  useDeleteAssistantSession,
  useSendAssistantMessage,
} from "@/hooks/use-ai-assistant";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import type { AiChatMessageDto, AiTenderExtractResult } from "@rothern/shared";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowRight,
  FileText,
  History,
  Paperclip,
  Plus,
  Send,
  Sparkles,
  Trash2,
  X,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AssistantMarkdown } from "./assistant-markdown";

interface LocalMsg {
  id: string;
  role: "USER" | "ASSISTANT";
  content: string;
  at?: string;
  tools?: string[];
  draft?: AiTenderExtractResult;
  /** Canlı gelen yanıt — daktilo efektiyle yazılır (geçmişten yüklenen yazılmaz). */
  typed?: boolean;
}

/** Bekleme sırasında dönüşümlü durum metinleri — asistan "canlı" hissettirsin. */
const THINKING_PHRASES = [
  "Düşünüyorum…",
  "Bilgilere bakıyorum…",
  "Yanıtı hazırlıyorum…",
];

/** Yanıt beklerken üç zıplayan nokta + dönüşümlü durum metni. */
function ThinkingBubble() {
  const [phrase, setPhrase] = useState(0);
  useEffect(() => {
    const t = setInterval(
      () => setPhrase((p) => (p + 1) % THINKING_PHRASES.length),
      2200,
    );
    return () => clearInterval(t);
  }, []);
  return (
    <div className="flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 animate-pulse items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-zinc-100 px-3.5 py-2.5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="h-1.5 w-1.5 animate-bounce rounded-full bg-brand-500"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
        <span className="text-xs text-zinc-400">{THINKING_PHRASES[phrase]}</span>
      </div>
    </div>
  );
}

/** Daktilo efekti — canlı gelen asistan yanıtını harf harf yazar (~2sn'de
 *  tamamlanır; uzun metinde adım büyür, animasyon uzamaz). */
function TypewriterMarkdown({
  text,
  onProgress,
}: {
  text: string;
  onProgress?: () => void;
}) {
  const [len, setLen] = useState(0);
  useEffect(() => {
    if (len >= text.length) return;
    const step = Math.max(2, Math.ceil(text.length / 120));
    const t = setTimeout(() => {
      setLen((l) => Math.min(text.length, l + step));
      onProgress?.();
    }, 16);
    return () => clearTimeout(t);
  }, [len, text, onProgress]);
  const done = len >= text.length;
  return (
    <span>
      <AssistantMarkdown text={text.slice(0, len)} />
      {!done ? (
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse bg-brand-500 align-middle" />
      ) : null}
    </span>
  );
}

const SEAT = { buy: "SATIN_ALMACI", sell: "SATISCI" };
const SUGGESTIONS = [
  "İhalelerimi göster",
  "Yeni ihale açmak istiyorum",
  "Son siparişlerim",
  "Açık ihaleleri ara",
];
const TOOL_LABEL: Record<string, string> = {
  list_my_tenders: "İhalelerinize baktım",
  search_open_tenders: "Açık ihaleleri aradım",
  get_tender_detail: "İhale detayına baktım",
  list_my_orders: "Siparişlerinize baktım",
  get_order_detail: "Sipariş detayına baktım",
  list_my_connections: "Bağlantılarınıza baktım",
  list_my_bids: "Tekliflerinize baktım",
  propose_tender_draft: "İhale taslağını hazırladım",
};

function initials(first?: string, last?: string): string {
  return `${(first ?? "")[0] ?? ""}${(last ?? "")[0] ?? ""}`.toUpperCase() || "S";
}

/** Faz AI-2/3 — asistan sohbet gövdesi (modern balonlar + belge + taslak kartı). */
export function AssistantPanel() {
  const { user } = useCompanyAuth();
  const router = useRouter();
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [input, setInput] = useState("");
  const [files, setFiles] = useState<File[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [suggestNew, setSuggestNew] = useState(false);
  // GEÇMİŞTEN yükleme flag'i: sadece kullanıcı bir sohbeti geçmişten SEÇİNCE
  // mesajları backend'den doldur. Aktif sohbette (yeni mesaj) optimistic akışı
  // EZME — aksi halde her mesaj sonrası oturum yeniden yüklenip mesajlar
  // karışıyor/kayboluyordu.
  const [loadHistoryId, setLoadHistoryId] = useState<string | null>(null);

  const sessions = useAssistantSessions(true);
  const loaded = useAssistantSession(loadHistoryId);
  const send = useSendAssistantMessage();
  const del = useDeleteAssistantSession();
  const usage = useAiUsage();
  const endRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  // Daktilo efekti sırasında balon büyüdükçe alta kaydır (smooth değil —
  // her karede smooth scroll titreşim yapar).
  const scrollToEnd = useCallback(() => {
    endRef.current?.scrollIntoView({ behavior: "auto" });
  }, []);

  useEffect(() => {
    if (loaded.data && loaded.data.id === loadHistoryId) {
      setSessionId(loaded.data.id);
      setMessages(
        loaded.data.messages.map((m: AiChatMessageDto) => ({
          id: m.id,
          role: m.role,
          content: m.content,
          at: m.createdAt,
        })),
      );
      setLoadHistoryId(null); // yüklendi — bir daha ezme
    }
  }, [loaded.data, loadHistoryId]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, send.isPending]);

  // Kullanım UYARISI (yüzde GÖSTERİLMEZ) — yalnız sınıra yaklaşınca/dolunca.
  const nearLimit = usage.data?.enabled !== false && usage.data?.warning === true;
  const quotaFull =
    usage.data?.enabled === false ? false : (usage.data?.percentUsed ?? 0) >= 100;

  const openHistory = (id: string) => {
    setLoadHistoryId(id);
    setShowHistory(false);
  };

  const startNew = () => {
    setSessionId(null);
    setLoadHistoryId(null);
    setMessages([]);
    setFiles([]);
    setSuggestNew(false);
    setShowHistory(false);
  };

  const submit = async (preset?: string) => {
    const text = (preset ?? input).trim();
    if ((!text && files.length === 0) || send.isPending) return;
    setInput("");
    const sentFiles = files;
    setFiles([]);
    const userLabel = text || `📎 ${sentFiles.map((f) => f.name).join(", ")}`;
    setMessages((m) => [
      ...m,
      { id: `u-${m.length}`, role: "USER", content: userLabel },
    ]);
    try {
      const reply = await send.mutateAsync({
        sessionId: sessionId ?? undefined,
        message: text,
        files: sentFiles.length > 0 ? sentFiles : undefined,
      });
      setSessionId(reply.sessionId);
      setSuggestNew(reply.suggestNewChat);
      setMessages((m) => [
        ...m,
        {
          id: `a-${m.length}`,
          role: "ASSISTANT",
          content: reply.reply,
          tools: reply.toolsUsed,
          draft: reply.tenderDraft,
          typed: true,
        },
      ]);
    } catch (err) {
      setMessages((m) => [
        ...m,
        {
          id: `err-${m.length}`,
          role: "ASSISTANT",
          content: extractErrorMessage(err, "Şu an yanıt veremedim — lütfen tekrar deneyin."),
          typed: true,
        },
      ]);
    }
  };

  // AI-3: taslak hazır → wizard'a taşı (portal'a göre yeni ihale/ilan sayfası).
  const openTenderForm = (draft: AiTenderExtractResult) => {
    const isBuyer = !!user?.roles.includes(SEAT.buy as never);
    sessionStorage.setItem("ai-tender-draft", JSON.stringify(draft));
    router.push(
      isBuyer
        ? "/company/satinalma/ihalelerim/yeni?ai=1"
        : "/company/satis/ilanlarim/yeni?ai=1",
    );
  };

  const addFiles = (list: FileList | null) => {
    if (!list) return;
    // FileList CANLI referanstır: onChange sonrası input.value="" onu boşaltır.
    // setState updater'ı handler bittikten SONRA koştuğu için diziyi burada,
    // senkron materialize etmek şart — aksi halde hep 0 dosya eklenir.
    const picked = Array.from(list);
    setFiles((f) => [...f, ...picked].slice(0, 10));
  };

  return (
    <div className="flex h-full flex-col bg-white">
      {/* Üst bar */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-950/10 px-4 py-2.5">
        <button
          type="button"
          onClick={startNew}
          className="flex items-center gap-1.5 rounded-lg px-2 py-1 text-sm font-medium text-zinc-600 hover:bg-zinc-100 hover:text-zinc-900"
        >
          <Plus className="h-4 w-4" /> Yeni
        </button>
        <div className="flex items-center gap-1">
          {nearLimit ? (
            <span
              className="mr-1 rounded-full bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-800"
              title="Aylık AI kullanımınız sınıra yaklaştı"
            >
              Kullanım yüksek
            </span>
          ) : null}
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            aria-label="Geçmiş sohbetler"
            className={cn(
              "flex items-center gap-1 rounded-lg px-2 py-1 text-sm hover:bg-zinc-100",
              showHistory ? "text-brand-700" : "text-zinc-500",
            )}
          >
            <History className="h-4 w-4" />
          </button>
        </div>
      </div>

      {showHistory ? (
        <div className="max-h-52 overflow-y-auto border-b border-zinc-950/10 bg-zinc-50/60">
          {(sessions.data ?? []).length === 0 ? (
            <p className="px-4 py-3 text-sm text-zinc-400">Kayıtlı sohbet yok</p>
          ) : (
            (sessions.data ?? []).map((s) => (
              <div
                key={s.id}
                className={cn(
                  "flex items-center gap-2 px-3 py-2 hover:bg-white",
                  sessionId === s.id ? "bg-white" : "",
                )}
              >
                <button
                  type="button"
                  onClick={() => openHistory(s.id)}
                  className={cn(
                    "min-w-0 flex-1 truncate text-left text-sm",
                    sessionId === s.id
                      ? "font-medium text-brand-700"
                      : "text-zinc-700",
                  )}
                >
                  {s.title ?? "Sohbet"}
                </button>
                <button
                  type="button"
                  aria-label="Sil"
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
      <div className="flex-1 space-y-4 overflow-y-auto px-4 py-4">
        {messages.length === 0 ? (
          <div className="flex h-full flex-col items-center justify-center px-2 text-center">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Sparkles className="h-6 w-6" />
            </div>
            <p className="mt-3 font-semibold text-zinc-900">Rothern Asistanı</p>
            <p className="mt-1 max-w-xs text-sm text-zinc-500">
              İhalelerinizi sorun, belge yükleyin ya da yeni bir ihale açmak için
              konuşun — gerekli bilgileri birlikte toplayalım.
            </p>
            <div className="mt-4 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => void submit(s)}
                  className="rounded-full border border-zinc-950/10 bg-white px-3 py-1.5 text-xs text-zinc-700 transition hover:border-brand-400 hover:text-brand-700"
                >
                  {s}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div key={m.id} className="space-y-1.5">
              <div
                className={cn(
                  "flex items-end gap-2",
                  m.role === "USER" ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
                    m.role === "USER"
                      ? "bg-zinc-200 text-zinc-600"
                      : "bg-gradient-to-br from-brand-500 to-brand-700 text-white",
                  )}
                >
                  {m.role === "USER" ? (
                    initials(user?.firstName, user?.lastName)
                  ) : (
                    <Sparkles className="h-3.5 w-3.5" />
                  )}
                </div>
                <div
                  className={cn(
                    "max-w-[80%] break-words rounded-2xl px-3.5 py-2 text-sm",
                    m.role === "USER"
                      ? "whitespace-pre-wrap rounded-br-sm bg-brand-600 text-white"
                      : "rounded-bl-sm bg-zinc-100 text-zinc-900",
                  )}
                >
                  {m.role === "USER" ? (
                    m.content
                  ) : m.typed ? (
                    <TypewriterMarkdown text={m.content} onProgress={scrollToEnd} />
                  ) : (
                    <AssistantMarkdown text={m.content} />
                  )}
                </div>
              </div>

              {/* Araç rozeti */}
              {m.tools && m.tools.length > 0 ? (
                <p className="pl-9 text-xs text-zinc-400">
                  {m.tools.map((t) => TOOL_LABEL[t] ?? t).join(" · ")}
                </p>
              ) : null}

              {/* AI-3 taslak kartı */}
              {m.draft ? (
                <div className="ml-9 rounded-xl border border-brand-200 bg-brand-50/60 p-3">
                  <p className="flex items-center gap-1.5 text-sm font-semibold text-brand-900">
                    <FileText className="h-4 w-4" /> İhale Taslağı
                  </p>
                  <ul className="mt-1.5 space-y-0.5 text-xs text-zinc-700">
                    {m.draft.draft.title ? <li>• Başlık: {m.draft.draft.title}</li> : null}
                    {m.draft.draft.items.filter((i) => i.name).length > 0 ? (
                      <li>• {m.draft.draft.items.filter((i) => i.name).length} kalem</li>
                    ) : null}
                    {m.draft.draft.deliveryTerm ? <li>• Teslim: {m.draft.draft.deliveryTerm}</li> : null}
                    {m.draft.draft.bidsCloseAt ? (
                      <li>
                        • Kapanış:{" "}
                        {format(new Date(m.draft.draft.bidsCloseAt), "d MMM yyyy", { locale: tr })}
                      </li>
                    ) : null}
                  </ul>
                  {m.draft.missingRequired.length > 0 ? (
                    <p className="mt-1.5 text-xs text-zinc-500">
                      Eksik: {m.draft.missingRequired.join(", ")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openTenderForm(m.draft!)}
                    className="mt-2 flex items-center gap-1.5 rounded-lg bg-brand-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
                  >
                    İhale formunu aç <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                </div>
              ) : null}
            </div>
          ))
        )}
        {send.isPending ? <ThinkingBubble /> : null}
        <div ref={endRef} />
      </div>

      {suggestNew ? (
        <p className="border-t border-zinc-950/10 bg-amber-50 px-4 py-2 text-xs text-amber-800">
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
          <>
            {files.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="flex items-center gap-1 rounded-lg border border-zinc-950/10 bg-zinc-50 px-2 py-1 text-xs text-zinc-600"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      aria-label="Kaldır"
                    >
                      <X className="h-3 w-3 hover:text-red-600" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-1.5">
              <input
                ref={fileRef}
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic"
                multiple
                hidden
                onChange={(e) => {
                  addFiles(e.target.files);
                  e.target.value = "";
                }}
              />
              <button
                type="button"
                onClick={() => fileRef.current?.click()}
                disabled={send.isPending}
                aria-label="Belge ekle"
                title="İhale belgesi ekle"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl text-zinc-500 hover:bg-zinc-100 hover:text-zinc-800"
              >
                <Paperclip className="h-4 w-4" />
              </button>
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
                placeholder="Bir şey sorun veya ihale açın…"
                disabled={send.isPending}
                className="max-h-32 flex-1 resize-none rounded-xl border border-zinc-950/10 px-3 py-2 text-sm focus:border-brand-400 focus:outline-none focus:ring-1 focus:ring-brand-400"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={send.isPending || (!input.trim() && files.length === 0)}
                aria-label="Gönder"
                className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white transition hover:bg-brand-700 disabled:opacity-40"
              >
                <Send className="h-4 w-4" />
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
