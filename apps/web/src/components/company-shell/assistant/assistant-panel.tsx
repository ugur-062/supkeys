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
  Check,
  FileText,
  Gavel,
  History,
  Info,
  MessageSquareText,
  Package,
  Paperclip,
  Plus,
  Search,
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
  /** Kullanıcının bu mesajla gönderdiği belge adları — balonda chip olarak kalır. */
  files?: string[];
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
    <div className="rt-fade-in flex items-end gap-2">
      <div className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm ring-1 ring-zinc-950/10">
        <Sparkles className="h-3.5 w-3.5" />
      </div>
      <div className="flex items-center gap-2 rounded-2xl rounded-bl-sm bg-surface-subtle px-4 py-2.5 ring-1 ring-zinc-950/5">
        <span className="flex gap-1">
          {[0, 1, 2].map((i) => (
            <span
              key={i}
              className="rt-dot h-1.5 w-1.5 rounded-full bg-brand-500"
              style={{ animationDelay: `${i * 150}ms` }}
            />
          ))}
        </span>
        {/* key remount → rt-fade-in ile yumuşak metin geçişi */}
        <span key={phrase} className="rt-fade-in text-xs text-zinc-500">
          {THINKING_PHRASES[phrase]}
        </span>
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
        <span className="ml-0.5 inline-block h-3.5 w-0.5 animate-pulse rounded-full bg-brand-600 align-middle" />
      ) : null}
    </span>
  );
}

const SEAT = { buy: "SATIN_ALMACI", sell: "SATISCI" };
// Metinler aynen korunur (submit'e aynı string gider) — yalnız ikon eşleşir.
const SUGGESTIONS = [
  { label: "İhalelerimi göster", icon: Gavel },
  { label: "Yeni ihale açmak istiyorum", icon: Plus },
  { label: "Son siparişlerim", icon: Package },
  { label: "Açık ihaleleri ara", icon: Search },
] as const;
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
export function AssistantPanel({ onClose }: { onClose?: () => void }) {
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
  const inputRef = useRef<HTMLTextAreaElement>(null);

  // Composer otomatik büyür: yazdıkça yükseklik içeriğe uyar (scroll yerine),
  // tavana (max-h) dayanınca kaydırmaya döner. Gönderim sonrası tek satıra iner.
  useEffect(() => {
    const el = inputRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [input]);

  // İmleç sohbette KALIR: panel açılınca ve her yanıt sonrasında (gönderim
  // sırasında textarea disabled olup odağı düşürüyor) giriş yeniden odaklanır —
  // kullanıcı her mesajdan sonra tekrar tıklamak zorunda kalmaz.
  useEffect(() => {
    if (!send.isPending) inputRef.current?.focus();
  }, [send.isPending]);
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
    setMessages((m) => [
      ...m,
      {
        id: `u-${m.length}`,
        role: "USER",
        content: text,
        // Belgeler balonda chip olarak görünür kalır (yalnız görsel — akış aynı).
        ...(sentFiles.length > 0
          ? { files: sentFiles.map((f) => f.name) }
          : {}),
      },
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
      {/* Başlık — markalı kimlik solda, aksiyonlar sağda (tek satır) */}
      <div className="flex items-center justify-between gap-2 border-b border-zinc-950/10 px-4 py-3">
        <div className="flex min-w-0 items-center gap-2.5">
          <div className="relative shrink-0">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm">
              <Sparkles className="h-4 w-4" />
            </div>
            {/* Çevrimiçi durum noktası */}
            <span className="absolute -bottom-0.5 -right-0.5 h-2.5 w-2.5 rounded-full border-2 border-white bg-success-500" />
          </div>
          <div className="min-w-0 leading-tight">
            <p className="truncate text-sm font-semibold text-zinc-900">
              Rothern Asistanı
            </p>
            {/* Alt satır yalnız kullanım uyarısında görünür (yeşil nokta zaten
                çevrimiçi durumunu anlatıyor). */}
            {nearLimit ? (
              <p
                className="truncate text-[11px] font-medium text-warning-600"
                title="Aylık AI kullanımınız sınıra yaklaştı"
              >
                Kullanım sınıra yakın
              </p>
            ) : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-1">
          <button
            type="button"
            onClick={startNew}
            className="flex items-center gap-1 rounded-full border border-zinc-950/10 bg-white px-2.5 py-1.5 text-xs font-medium text-zinc-700 shadow-sm transition-colors hover:border-zinc-300 hover:bg-zinc-50 hover:text-zinc-900"
          >
            <Plus className="h-3.5 w-3.5" /> Yeni sohbet
          </button>
          <button
            type="button"
            onClick={() => setShowHistory((s) => !s)}
            aria-label="Geçmiş sohbetler"
            title="Geçmiş sohbetler"
            className={cn(
              "flex h-8 w-8 items-center justify-center rounded-full transition-colors hover:bg-zinc-100 hover:text-zinc-900",
              showHistory ? "bg-zinc-100 text-brand-700" : "text-zinc-500",
            )}
          >
            <History className="h-4 w-4" />
          </button>
          {onClose ? (
            <>
              <span className="mx-0.5 h-5 w-px bg-zinc-950/10" />
              <button
                type="button"
                aria-label="Kapat"
                onClick={onClose}
                className="flex h-8 w-8 items-center justify-center rounded-full text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-700"
              >
                <X className="h-4.5 w-4.5" />
              </button>
            </>
          ) : null}
        </div>
      </div>

      {showHistory ? (
        <div className="rt-fade-in border-b border-zinc-950/10 bg-surface-subtle">
          <div className="flex items-center justify-between px-4 pb-1 pt-2.5">
            <p className="text-[11px] font-medium uppercase tracking-wider text-zinc-400">
              Geçmiş sohbetler
            </p>
            {(sessions.data ?? []).length > 0 ? (
              <span className="text-[11px] tabular-nums text-zinc-400">
                {(sessions.data ?? []).length}
              </span>
            ) : null}
          </div>
          {(sessions.data ?? []).length === 0 ? (
            <div className="flex flex-col items-center gap-1.5 px-4 pb-4 pt-2 text-center">
              <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-white text-zinc-300 ring-1 ring-zinc-950/5">
                <MessageSquareText className="h-4 w-4" />
              </span>
              <p className="text-xs text-zinc-400">
                Henüz kayıtlı sohbet yok — ilk mesajınızla oluşur.
              </p>
            </div>
          ) : (
            <div className="max-h-60 overflow-y-auto pb-1.5">
              {(sessions.data ?? []).map((s) => (
                <div
                  key={s.id}
                  className={cn(
                    "group flex items-center gap-2.5 border-l-2 px-3.5 py-2 transition-colors hover:bg-white",
                    sessionId === s.id
                      ? "border-l-brand-600 bg-white"
                      : "border-l-transparent",
                  )}
                >
                  <span
                    className={cn(
                      "flex h-7 w-7 shrink-0 items-center justify-center rounded-lg bg-white ring-1 ring-zinc-950/5",
                      sessionId === s.id ? "text-brand-700" : "text-zinc-400",
                    )}
                  >
                    <MessageSquareText className="h-3.5 w-3.5" />
                  </span>
                  <button
                    type="button"
                    onClick={() => openHistory(s.id)}
                    className="min-w-0 flex-1 text-left"
                  >
                    <p
                      className={cn(
                        "truncate text-sm",
                        sessionId === s.id
                          ? "font-medium text-brand-700"
                          : "text-zinc-700",
                      )}
                    >
                      {s.title ?? "Sohbet"}
                    </p>
                    <p className="truncate text-[11px] text-zinc-400">
                      {format(new Date(s.lastMessageAt), "d MMM yyyy HH:mm", {
                        locale: tr,
                      })}
                      {" · "}
                      {s.turnCount} yazışma
                    </p>
                  </button>
                  <button
                    type="button"
                    aria-label="Sil"
                    onClick={() => {
                      void del.mutateAsync(s.id);
                      if (sessionId === s.id) startNew();
                    }}
                    className="text-zinc-400 opacity-0 transition-opacity hover:text-danger-500 focus-visible:opacity-100 group-hover:opacity-100"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
        </div>
      ) : null}

      {/* Balonlar — scrollbar gizli (daktilo yazarken çubuk belirip kaymasın);
          tekerlek/dokunmatik kaydırma çalışmaya devam eder. */}
      <div className="flex-1 space-y-5 overflow-y-auto px-4 py-4 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
        {messages.length === 0 ? (
          <div className="rt-fade-in flex h-full flex-col items-center justify-center px-2 text-center">
            <div className="relative">
              {/* Yumuşak monokrom hale — nefes alır (reduced-motion'da durur) */}
              <div
                aria-hidden
                className="rt-breathe absolute -inset-5 rounded-full bg-gradient-to-br from-zinc-300/50 via-zinc-100/40 to-transparent blur-xl"
              />
              <div className="relative flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-lg ring-1 ring-zinc-950/10">
                <Sparkles className="h-6 w-6" />
              </div>
            </div>
            <p className="mt-3 text-[10px] font-medium uppercase tracking-widest text-zinc-400">
              Rothern Asistanı
            </p>
            <p className="mt-1 text-base font-semibold tracking-tight text-zinc-900">
              Size nasıl yardımcı olabilirim?
            </p>
            <p className="mt-1 max-w-xs text-sm text-zinc-500">
              İhalelerinizi sorun, belge yükleyin ya da konuşarak yeni ihale
              açın.
            </p>
            <div className="mt-5 flex flex-wrap justify-center gap-2">
              {SUGGESTIONS.map((s) => (
                <button
                  key={s.label}
                  type="button"
                  onClick={() => void submit(s.label)}
                  className="group flex items-center gap-1.5 rounded-full border border-zinc-950/10 bg-surface-subtle px-3 py-1.5 text-xs font-medium text-zinc-600 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:border-zinc-300 hover:bg-white hover:text-zinc-900 hover:shadow-md active:translate-y-0 active:shadow-sm"
                >
                  <s.icon className="h-3.5 w-3.5 text-zinc-400 transition-colors group-hover:text-brand-600" />
                  {s.label}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m) => (
            <div
              key={m.id}
              className={cn(
                "space-y-1.5",
                // Giriş animasyonu yalnız CANLI mesajlarda — geçmiş yüklemesi
                // topluca animasyonlanmasın (typed geçmişte set edilmez).
                (m.typed || m.role === "USER") && !m.at ? "rt-fade-in" : "",
              )}
            >
              <div
                className={cn(
                  "flex items-end gap-2",
                  m.role === "USER" ? "flex-row-reverse" : "flex-row",
                )}
              >
                <div
                  className={cn(
                    "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ring-1 ring-zinc-950/10",
                    m.role === "USER"
                      ? "bg-zinc-100 text-zinc-600"
                      : "bg-gradient-to-br from-brand-500 to-brand-700 text-white shadow-sm",
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
                    "max-w-[80%] break-words rounded-2xl px-4 py-2.5 text-sm leading-relaxed",
                    m.role === "USER"
                      ? "whitespace-pre-wrap rounded-br-sm bg-brand-600 text-white shadow-sm"
                      : "rounded-bl-sm bg-surface-subtle text-zinc-900 shadow-sm ring-1 ring-zinc-950/5",
                  )}
                >
                  {m.role === "USER" ? (
                    <>
                      {m.content}
                      {m.files && m.files.length > 0 ? (
                        <span
                          className={cn(
                            "flex flex-wrap gap-1.5",
                            m.content ? "mt-1.5" : "",
                          )}
                        >
                          {m.files.map((name, i) => (
                            <span
                              key={`${name}-${i}`}
                              className="inline-flex max-w-full items-center gap-1 rounded-lg bg-white/15 px-2 py-1 text-xs text-white ring-1 ring-white/20"
                            >
                              <FileText className="h-3 w-3 shrink-0" />
                              <span className="truncate">{name}</span>
                            </span>
                          ))}
                        </span>
                      ) : null}
                    </>
                  ) : m.typed ? (
                    <TypewriterMarkdown text={m.content} onProgress={scrollToEnd} />
                  ) : (
                    <AssistantMarkdown text={m.content} />
                  )}
                </div>
              </div>

              {/* Araç rozetleri — mini chip'ler, yeşil onay noktası */}
              {m.tools && m.tools.length > 0 ? (
                <div className="flex flex-wrap gap-1 pl-9">
                  {m.tools.map((t) => (
                    <span
                      key={t}
                      className="inline-flex items-center gap-1 rounded-full bg-surface-muted px-2 py-0.5 text-[11px] font-medium text-zinc-500 ring-1 ring-zinc-950/5"
                    >
                      <Check className="h-3 w-3 text-success-500" />
                      {TOOL_LABEL[t] ?? t}
                    </span>
                  ))}
                </div>
              ) : null}

              {/* AI-3 taslak kartı — kart diline hizalı */}
              {m.draft ? (
                <div className="rt-fade-in ml-9 rounded-xl border border-zinc-950/10 bg-white p-3.5 shadow-sm">
                  <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
                    <span className="flex h-6 w-6 items-center justify-center rounded-md bg-gradient-to-br from-brand-500 to-brand-700 text-white">
                      <FileText className="h-3.5 w-3.5" />
                    </span>
                    İhale Taslağı
                  </p>
                  <ul className="mt-2 space-y-1 text-xs">
                    {m.draft.draft.title ? (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                        <span className="text-zinc-500">
                          Başlık:{" "}
                          <span className="font-medium text-zinc-800">
                            {m.draft.draft.title}
                          </span>
                        </span>
                      </li>
                    ) : null}
                    {m.draft.draft.items.filter((i) => i.name).length > 0 ? (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                        <span className="font-medium text-zinc-800">
                          {m.draft.draft.items.filter((i) => i.name).length} kalem
                        </span>
                      </li>
                    ) : null}
                    {m.draft.draft.deliveryTerm ? (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                        <span className="text-zinc-500">
                          Teslim:{" "}
                          <span className="font-medium text-zinc-800">
                            {m.draft.draft.deliveryTerm}
                          </span>
                        </span>
                      </li>
                    ) : null}
                    {m.draft.draft.bidsCloseAt ? (
                      <li className="flex items-start gap-1.5">
                        <span className="mt-1.5 h-1 w-1 shrink-0 rounded-full bg-zinc-300" />
                        <span className="text-zinc-500">
                          Kapanış:{" "}
                          <span className="font-medium text-zinc-800">
                            {format(new Date(m.draft.draft.bidsCloseAt), "d MMM yyyy", { locale: tr })}
                          </span>
                        </span>
                      </li>
                    ) : null}
                  </ul>
                  {m.draft.missingRequired.length > 0 ? (
                    <p className="mt-2 rounded-lg bg-warning-50 px-2 py-1.5 text-xs text-warning-600">
                      Eksik: {m.draft.missingRequired.join(", ")}
                    </p>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => openTenderForm(m.draft!)}
                    className="group mt-3 flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-600 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-brand-700"
                  >
                    İhale formunu aç
                    <ArrowRight className="h-3.5 w-3.5 transition-transform group-hover:translate-x-0.5" />
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
        <p className="flex items-center gap-2 border-t border-warning-500/20 bg-warning-50 px-4 py-2 text-xs text-warning-600">
          <Info className="h-3.5 w-3.5 shrink-0" />
          Bu sohbet uzadı — daha iyi sonuç için yeni bir sohbet başlatabilirsiniz.
        </p>
      ) : null}

      {/* Composer — entegre pill: ataç + input + gönder tek konteynerde */}
      <div className="border-t border-zinc-950/10 bg-white p-3">
        {quotaFull ? (
          <p className="flex items-center gap-2 rounded-xl border border-zinc-950/10 bg-surface-subtle px-3 py-2.5 text-sm text-zinc-600">
            <Info className="h-4 w-4 shrink-0 text-zinc-400" />
            Aylık AI bütçeniz doldu — ay sonunda yenilenir.
          </p>
        ) : (
          <>
            {files.length > 0 ? (
              <div className="mb-2 flex flex-wrap gap-1.5">
                {files.map((f, i) => (
                  <span
                    key={`${f.name}-${i}`}
                    className="rt-fade-in flex items-center gap-1.5 rounded-lg border border-zinc-950/10 bg-white px-2 py-1 text-xs text-zinc-600 shadow-sm"
                  >
                    <FileText className="h-3 w-3" />
                    <span className="max-w-[120px] truncate">{f.name}</span>
                    <button
                      type="button"
                      onClick={() => setFiles(files.filter((_, j) => j !== i))}
                      aria-label="Kaldır"
                      className="text-zinc-400 transition-colors hover:text-danger-500"
                    >
                      <X className="h-3 w-3" />
                    </button>
                  </span>
                ))}
              </div>
            ) : null}
            <div className="flex items-end gap-1 rounded-2xl border border-zinc-950/10 bg-surface-subtle p-1.5 transition-colors focus-within:border-brand-400 focus-within:bg-white focus-within:ring-1 focus-within:ring-brand-400">
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
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl text-zinc-500 transition-colors hover:bg-zinc-200/60 hover:text-zinc-800 disabled:opacity-40"
              >
                <Paperclip className="h-4 w-4" />
              </button>
              <textarea
                ref={inputRef}
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
                className="max-h-56 flex-1 resize-none bg-transparent px-2 py-1.5 text-sm placeholder:text-zinc-400 focus:outline-none"
              />
              <button
                type="button"
                onClick={() => void submit()}
                disabled={send.isPending || (!input.trim() && files.length === 0)}
                aria-label="Gönder"
                className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-brand-600 text-white shadow-sm transition-all duration-200 hover:bg-brand-700 enabled:hover:shadow-md disabled:bg-zinc-200 disabled:text-zinc-400 disabled:shadow-none"
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
