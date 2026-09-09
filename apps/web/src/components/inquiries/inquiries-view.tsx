"use client";

import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { SilverLockCard } from "@/components/company/silver-lock-card";
import { companyActivityLabel } from "@rothern/shared";
import { EmptyState } from "@/components/list";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { Badge } from "@/components/catalyst/badge";
import { formatDate } from "@/lib/format-date";
import { cn } from "@/lib/utils";
import {
  useReceivedInquiries,
  useReplyInquiry,
  useSentInquiries,
  type InquiryReply,
  type ReceivedInquiry,
  type SentInquiry,
} from "@/hooks/use-inquiries";
import { ArrowLeftIcon, MagnifyingGlassIcon, PaperAirplaneIcon } from "@heroicons/react/20/solid";
import { Inbox, Send } from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/**
 * BİLGİ TALEPLERİ — gelen kutusu düzeni (2026-09-09 yeniden tasarım).
 *
 * Solda konuşma listesi (karşı taraf · ürün · son mesaj · zaman · durum),
 * sağda seçili konuşma balon görünümünde + altta yanıt kutusu (satıcı).
 * Mobilde liste → konuşma (geri oku). Eski hâli üst üste dizilmiş kartlardı;
 * 20 talepte sayfa uzuyor, hangisinin yanıt beklediği okunmuyordu.
 *
 * PORTAL YÖNÜ içeriği belirler (değişmedi):
 *   satis     → ürünlerime GELEN sorular (yanıt yazılır)
 *   satinalma → GÖNDERDİĞİM sorular (yanıtlar okunur)
 * Karşı yönün sorgusu hiç açılmaz. Ziyaretçinin e-postası/telefonu
 * gösterilmez — uç zaten döndürmüyor. Renk portaldan: satınalma mavi,
 * satış siyah (bileşen portal bilmez, çağıran verir).
 */
export function InquiriesView({
  portal = "satis",
}: {
  portal?: "satis" | "satinalma";
} = {}) {
  const isSeller = portal === "satis";
  const accent = isSeller ? "zinc" : "blue";
  const received = useReceivedInquiries(isSeller);
  const sent = useSentInquiries(!isSeller);
  const [filter, setFilter] = useState<"all" | "open" | "answered">("all");
  const [q, setQ] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileOpen, setMobileOpen] = useState(false);

  /* Tek liste modeli: iki yön aynı satır biçimine indirgenir; süzgeç ve arama
     ortak çalışır. `answered` = en az bir yanıt. */
  const threads: Thread[] = useMemo(() => {
    if (isSeller) {
      return (received.data?.items ?? []).map((i) => ({
        id: i.id,
        kind: "received" as const,
        title: i.anonymous ? null : (i.name ?? i.companyName ?? "Alıcı"),
        subtitle: i.anonymous ? null : (i.companyName && i.name ? i.companyName : null),
        product: i.product,
        message: i.message,
        quantity: i.quantity,
        at: i.receivedAt,
        replies: i.replies,
        raw: i,
      }));
    }
    return (sent.data ?? []).map((i) => ({
      id: i.id,
      kind: "sent" as const,
      title: i.seller.name,
      subtitle: null,
      product: i.product,
      message: i.message,
      quantity: i.quantity,
      at: i.sentAt,
      replies: i.replies,
      raw: i,
    }));
  }, [isSeller, received.data, sent.data]);

  const openCount = threads.filter((t) => t.replies.length === 0).length;
  const answeredCount = threads.length - openCount;
  const term = q.trim().toLocaleLowerCase("tr");
  const visible = threads.filter((t) => {
    if (filter === "open" && t.replies.length > 0) return false;
    if (filter === "answered" && t.replies.length === 0) return false;
    if (!term) return true;
    return [t.title, t.subtitle, t.product.name, t.message]
      .filter(Boolean)
      .some((s) => (s as string).toLocaleLowerCase("tr").includes(term));
  });

  // Masaüstünde ilk konuşma seçili gelir; seçili olan süzgeçle kaybolursa ilkine düş.
  useEffect(() => {
    if (visible.length === 0) {
      if (selectedId) setSelectedId(null);
      return;
    }
    if (!selectedId || !visible.some((t) => t.id === selectedId)) setSelectedId(visible[0].id);
  }, [visible, selectedId]);
  const selected = visible.find((t) => t.id === selectedId) ?? null;

  const loading = isSeller ? received.isLoading : sent.isLoading;
  const locked = isSeller && !!received.data?.locked;

  return (
    <PageContainer>
      <PageHeader
        title={isSeller ? "Bilgi Talepleri" : "Bilgi Taleplerim"}
        description={
          isSeller
            ? "Ürünleriniz hakkında gelen sorular — yanıtladıkça alıcı panelinde görünür."
            : "Tedarikçi ürünleri hakkında gönderdiğiniz sorular ve gelen yanıtlar."
        }
        action={
          isSeller ? undefined : (
            <Link
              href="/company/satinalma/urunler"
              className="rounded-full bg-blue-600 px-4 py-2 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              Ürün ara
            </Link>
          )
        }
      />

      {/* Ücretsiz satıcı (2026-09-06): soruyu görür, kimlik/iletişim/yanıt Silver ile. */}
      {locked ? (
        <div className="mt-6">
          <SilverLockCard
            title={
              threads.length > 0
                ? `${threads.length} bilgi talebi — kim sorduğu ve yanıt Silver ile açılır`
                : "Gelen soruları görürsünüz; kim sorduğu ve yanıt Silver ile açılır"
            }
            description="Ücretsiz üyelikte alıcının sorusunu, adedini ve şehrini görürsünüz. Alıcının kimliği, iletişim bilgileri ve yanıt gönderme Silver paketiyle açılır — alıcı, doğrulanmış tedarikçilere yöneliyor."
          />
        </div>
      ) : null}

      {loading ? (
        <p className="mt-8 text-sm text-zinc-500">Yükleniyor…</p>
      ) : threads.length === 0 ? (
        <EmptyState
          className="mt-8"
          icon={isSeller ? Inbox : Send}
          title={isSeller ? "Henüz bilgi talebi yok." : "Gönderdiğiniz talep yok."}
          description={
            isSeller
              ? "Ürünlerinizi vitrine çıkardığınızda alıcılar buradan soru sorabilir."
              : "Bir ürüne girip 'Bilgi / teklif iste' ile soru gönderin; yanıtlar burada birikir."
          }
        />
      ) : (
        <>
          {/* Araç çubuğu: süzgeç çipleri + arama. Renk portaldan. */}
          <div className="mt-6 flex flex-wrap items-center justify-between gap-3">
            <div className="inline-flex gap-1 rounded-xl bg-zinc-100 p-1" role="tablist" aria-label="Süzgeç">
              {(
                [
                  { key: "all", label: "Tümü", count: threads.length },
                  { key: "open", label: isSeller ? "Yanıt bekleyen" : "Yanıt bekleniyor", count: openCount },
                  { key: "answered", label: isSeller ? "Yanıtlanan" : "Yanıt gelen", count: answeredCount },
                ] as const
              ).map((f) => (
                <button
                  key={f.key}
                  type="button"
                  role="tab"
                  aria-selected={filter === f.key}
                  onClick={() => setFilter(f.key)}
                  className={cn(
                    "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                    filter === f.key ? "bg-white text-zinc-950 shadow-sm ring-1 ring-zinc-950/5" : "text-zinc-500 hover:text-zinc-900",
                  )}
                >
                  {f.label}
                  <span className="ml-1.5 text-xs font-medium tabular-nums text-zinc-400">{f.count}</span>
                </button>
              ))}
            </div>
            <div className="relative w-full sm:w-72">
              <MagnifyingGlassIcon aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-zinc-400" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder={isSeller ? "Alıcı, ürün ya da mesaj ara" : "Firma, ürün ya da mesaj ara"}
                aria-label="Bilgi taleplerinde ara"
                className="w-full rounded-lg border border-zinc-300 py-2 pr-3 pl-9 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
              />
            </div>
          </div>

          {/* GELEN KUTUSU: sol liste + sağ konuşma. Mobilde tek panel. */}
          <div className="mt-4 grid min-h-[32rem] grid-cols-1 overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-zinc-950/5 lg:grid-cols-[22rem_minmax(0,1fr)]">
            <div className={cn("border-zinc-950/5 lg:border-r", mobileOpen ? "hidden lg:block" : "block")}>
              {visible.length === 0 ? (
                <p className="p-6 text-sm text-zinc-500">Bu süzgeçte talep yok.</p>
              ) : (
                <ul className="divide-y divide-zinc-950/5" aria-label="Bilgi talepleri">
                  {visible.map((t) => (
                    <ThreadRow
                      key={t.id}
                      thread={t}
                      active={t.id === selectedId}
                      accent={accent}
                      isSeller={isSeller}
                      onSelect={() => {
                        setSelectedId(t.id);
                        setMobileOpen(true);
                      }}
                    />
                  ))}
                </ul>
              )}
            </div>
            <div className={cn("min-w-0", mobileOpen ? "block" : "hidden lg:block")}>
              {selected ? (
                <ThreadPane
                  key={selected.id}
                  thread={selected}
                  isSeller={isSeller}
                  accent={accent}
                  onBack={() => setMobileOpen(false)}
                />
              ) : (
                <div className="flex h-full items-center justify-center p-10 text-sm text-zinc-500">Bir talep seçin.</div>
              )}
            </div>
          </div>
        </>
      )}
    </PageContainer>
  );
}

/* ------------------------------------------------------------------ */

interface Thread {
  id: string;
  kind: "received" | "sent";
  /** Karşı taraf — anonimde null (ücretsiz satıcı). */
  title: string | null;
  subtitle: string | null;
  product: { name: string; slug: string | null };
  message: string;
  quantity: string | null;
  at: string | null;
  replies: InquiryReply[];
  raw: ReceivedInquiry | SentInquiry;
}

function initials(s: string | null): string {
  if (!s) return "?";
  const parts = s.trim().split(/\s+/).slice(0, 2);
  return parts.map((p) => p[0]?.toLocaleUpperCase("tr") ?? "").join("") || "?";
}

function ThreadRow({
  thread: t,
  active,
  accent,
  isSeller,
  onSelect,
}: {
  thread: Thread;
  active: boolean;
  accent: "zinc" | "blue";
  isSeller: boolean;
  onSelect: () => void;
}) {
  const open = t.replies.length === 0;
  const last = t.replies.length ? t.replies[t.replies.length - 1] : null;
  // Son hareket: yanıt varsa yanıt, yoksa soru. Satırda "Kim: …" biçimi —
  // konuşma balonundaki tam metinle aynı dize olmasın (okuma ve test için).
  const excerpt = last
    ? `${isSeller ? "Siz" : t.title ?? "Satıcı"}: ${last.body}`
    : `${isSeller ? (t.title ?? "Alıcı") : "Siz"}: ${t.message}`;
  return (
    <li>
      <button
        type="button"
        onClick={onSelect}
        aria-current={active ? "true" : undefined}
        className={cn(
          "flex w-full items-start gap-3 px-4 py-3 text-left transition hover:bg-zinc-50",
          active && (accent === "blue" ? "bg-blue-50/70 hover:bg-blue-50" : "bg-zinc-100 hover:bg-zinc-100"),
        )}
      >
        <span
          aria-hidden
          className={cn(
            "mt-0.5 flex size-9 shrink-0 items-center justify-center rounded-full text-xs font-semibold",
            t.title ? (accent === "blue" ? "bg-blue-100 text-blue-800" : "bg-zinc-900 text-white") : "bg-zinc-200 text-zinc-500",
          )}
        >
          {initials(t.title)}
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-baseline justify-between gap-2">
            <span className={cn("truncate text-sm font-semibold", t.title ? "text-zinc-950" : "text-zinc-500")}>
              {t.title ?? "Alıcı kimliği gizli"}
            </span>
            <span className="shrink-0 text-[11px] text-zinc-500">{t.at ? formatDate(t.at, "short") : ""}</span>
          </span>
          <span className="block truncate text-xs text-zinc-600">{t.product.name}</span>
          <span className={cn("mt-0.5 block truncate text-xs", open ? "font-medium text-zinc-800" : "text-zinc-500")}>{excerpt}</span>
        </span>
        {open ? (
          <span aria-label={isSeller ? "Yanıt bekliyor" : "Yanıt bekleniyor"} className={cn("mt-2 size-2 shrink-0 rounded-full", accent === "blue" ? "bg-blue-600" : "bg-amber-500")} />
        ) : null}
      </button>
    </li>
  );
}

function ThreadPane({
  thread: t,
  isSeller,
  accent,
  onBack,
}: {
  thread: Thread;
  isSeller: boolean;
  accent: "zinc" | "blue";
  onBack: () => void;
}) {
  const r = t.kind === "received" ? (t.raw as ReceivedInquiry) : null;
  const s = t.kind === "sent" ? (t.raw as SentInquiry) : null;
  const productHref =
    t.product.slug && (s?.seller.slug ?? null)
      ? `/company/satinalma/urunler/${s!.seller.slug}/${t.product.slug}`
      : isSeller
        ? "/company/satis/urunlerim"
        : null;
  const meta = r
    ? [r.buyerCity, ...(r.buyerActivities ?? []).map((a) => companyActivityLabel(a))].filter(Boolean).join(" · ")
    : null;

  return (
    <div className="flex h-full min-h-[32rem] flex-col">
      {/* Konuşma başlığı */}
      <div className="flex items-start gap-3 border-b border-zinc-950/5 px-5 py-4">
        <button type="button" onClick={onBack} className="mt-0.5 text-zinc-500 hover:text-zinc-900 lg:hidden" aria-label="Listeye dön">
          <ArrowLeftIcon aria-hidden className="size-5" />
        </button>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <p className={cn("text-sm font-semibold", t.title ? "text-zinc-950" : "text-zinc-500")}>
              {t.title ?? "Alıcı kimliği Silver ile açılır"}
            </p>
            {t.subtitle ? <span className="text-sm text-zinc-500">· {t.subtitle}</span> : null}
            {r ? (
              r.hasAccount ? <Badge color="emerald">Kayıtlı kullanıcı</Badge> : <Badge color="zinc">Misafir</Badge>
            ) : null}
            {t.replies.length === 0 ? (
              <Badge color="amber">{isSeller ? "Yanıt bekliyor" : "Yanıt bekleniyor"}</Badge>
            ) : (
              <Badge color="emerald">Yanıtlandı</Badge>
            )}
          </div>
          {meta ? <p className="mt-0.5 text-xs text-zinc-500">{meta}</p> : null}
          <p className="mt-1 text-xs text-zinc-600">
            <span className="text-zinc-500">Ürün:</span>{" "}
            {productHref ? (
              <Link href={productHref} className="font-medium text-zinc-900 underline-offset-2 hover:underline">
                {t.product.name}
              </Link>
            ) : (
              <span className="font-medium text-zinc-900">{t.product.name}</span>
            )}
            {t.quantity ? <span className="text-zinc-500"> · {t.quantity}</span> : null}
          </p>
        </div>
      </div>

      {/* Mesajlar — soru solda, yanıtlar sağda. */}
      <div className="flex-1 space-y-4 overflow-y-auto px-5 py-5">
        <Bubble side={isSeller ? "left" : "right"} accent={accent} at={t.at} who={isSeller ? (t.title ?? "Alıcı") : "Siz"}>
          {t.message}
        </Bubble>
        {t.replies.map((rep) => (
          <Bubble key={rep.id} side={isSeller ? "right" : "left"} accent={accent} at={rep.createdAt} who={isSeller ? "Siz" : (t.title ?? "Satıcı")}>
            {rep.body}
          </Bubble>
        ))}
        {!isSeller && t.replies.length === 0 ? (
          <p className="text-center text-xs text-zinc-500">Satıcı henüz yanıtlamadı — yanıt gelince burada ve bildirimlerde görünür.</p>
        ) : null}
      </div>

      {r ? <Composer inquiry={r} accent={accent} /> : null}
    </div>
  );
}

function Bubble({
  side,
  accent,
  who,
  at,
  children,
}: {
  side: "left" | "right";
  accent: "zinc" | "blue";
  who: string;
  at: string | null;
  children: string;
}) {
  const mine = side === "right";
  return (
    <div className={cn("flex flex-col", mine ? "items-end" : "items-start")}>
      <p className="mb-1 text-[11px] text-zinc-500">
        {who}
        {at ? ` · ${formatDate(at, "datetime")}` : ""}
      </p>
      <p
        className={cn(
          "max-w-[85%] rounded-2xl px-4 py-2.5 text-sm/6 whitespace-pre-line",
          mine
            ? accent === "blue"
              ? "rounded-tr-sm bg-blue-600 text-white"
              : "rounded-tr-sm bg-zinc-900 text-white"
            : "rounded-tl-sm bg-zinc-100 text-zinc-800",
        )}
      >
        {children}
      </p>
    </div>
  );
}

function Composer({ inquiry, accent }: { inquiry: ReceivedInquiry; accent: "zinc" | "blue" }) {
  const [body, setBody] = useState("");
  // Yanıt = "Bilgi taleplerini yanıtlama" işlem izni (API aynası); izinsiz okur.
  const canReply = useHasCompanyPermission("sell:inquiry:reply");
  const reply = useReplyInquiry();

  if (inquiry.anonymous) {
    return (
      <p className="border-t border-zinc-950/5 bg-zinc-50 px-5 py-3 text-xs text-zinc-600">
        Yanıtlamak ve alıcının iletişim bilgilerini görmek Silver paketiyle açılır.
      </p>
    );
  }
  if (!canReply) return null;

  const send = async () => {
    if (body.trim().length < 2) return;
    try {
      await reply.mutateAsync({ id: inquiry.id, body });
      setBody("");
      toast.success("Yanıtınız gönderildi");
    } catch {
      toast.error("Yanıt gönderilemedi");
    }
  };

  return (
    <div className="border-t border-zinc-950/5 px-5 py-4">
      <textarea
        value={body}
        onChange={(e) => setBody(e.target.value)}
        onKeyDown={(e) => {
          if ((e.metaKey || e.ctrlKey) && e.key === "Enter") void send();
        }}
        rows={3}
        maxLength={5000}
        placeholder="Yanıtınızı yazın…"
        className="w-full rounded-xl border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
      />
      <div className="mt-2 flex items-center justify-between gap-3">
        {/* Ziyaretçi henüz kaydolmadıysa yanıtı okumak için hesap açması gerekiyor. */}
        <p className="text-xs text-zinc-500">
          {inquiry.hasAccount
            ? "Yanıtınız alıcının panelinde görünür. Ctrl+Enter ile gönder."
            : "Ziyaretçiye “yanıt geldi” bildirimi gider; okumak için hesap açması gerekir."}
        </p>
        <button
          type="button"
          onClick={() => void send()}
          disabled={reply.isPending || body.trim().length < 2}
          className={cn(
            "inline-flex shrink-0 items-center gap-1.5 rounded-full px-4 py-2 text-sm font-semibold text-white transition disabled:opacity-50",
            accent === "blue" ? "bg-blue-600 hover:bg-blue-700" : "bg-zinc-950 hover:bg-zinc-800",
          )}
        >
          <PaperAirplaneIcon aria-hidden className="size-4" />
          Yanıtla
        </button>
      </div>
    </div>
  );
}
