"use client";

import {
  EmptyState,
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { ErrorState } from "@/components/ui/error-state";
import {
  useOrders,
  type CompanyOrder,
  type CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { sellerShipsGoods } from "@rothern/shared";
import { formatMoney } from "@/components/ui/money";
import { StatusBadge } from "@/components/ui/status-badge";
import { orderStatusMeta } from "@/lib/orders/order-status";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  Check,
  CircleSlash,
  ListFilter,
  Package,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 12;

// 5 aşamalı akış — orta adım teslim şekline göre "Gönderildi"/"Teslime Hazır".
function stagesFor(sellerShips: boolean) {
  return [
    "Onay Bekliyor",
    "Onaylandı",
    sellerShips ? "Gönderildi" : "Teslime Hazır",
    "Teslim Alındı",
    "Tamamlandı",
  ];
}
const STAGES = stagesFor(true);

function getStageState(status: CompanyOrderStatus): {
  active: number;
  lastDone: number;
  isTerminated: boolean;
} {
  if (status === "REJECTED" || status === "CANCELLED")
    return { active: -1, lastDone: -1, isTerminated: true };
  if (status === "PENDING") return { active: 0, lastDone: -1, isTerminated: false };
  if (status === "ACCEPTED" || status === "CREATED")
    return { active: 1, lastDone: 0, isTerminated: false };
  if (status === "IN_DELIVERY")
    return { active: 2, lastDone: 1, isTerminated: false };
  if (status === "DELIVERED")
    return { active: 3, lastDone: 2, isTerminated: false };
  if (status === "COMPLETED")
    return { active: 4, lastDone: 4, isTerminated: false };
  return { active: 0, lastDone: -1, isTerminated: false };
}

/**
 * Aşama göstergesi — ikonlu nokta stepper + TAM okunur tek satır etiket.
 * (Önceki tasarımda 5 minik yazı yan yana kırpılıyordu — "Teslim Alı…".)
 * Biten adımlar yeşil tikli, aktif adım mavi halkalı; adların tamamı yalnızca
 * aktif adım için yazılır, diğerleri hover'da (title) görünür.
 */
function StageStepper({
  active,
  lastDone,
  stages = STAGES,
}: {
  active: number;
  lastDone: number;
  stages?: string[];
}) {
  const STAGES = stages;
  const isDone = active === STAGES.length - 1 && lastDone === active;
  return (
    <div>
      <div className="flex items-center">
        {STAGES.map((label, i) => {
          const done = i <= lastDone || (isDone && i <= active);
          const current = !isDone && i === active;
          return (
            <div
              key={label}
              className={cn("flex items-center", i > 0 && "flex-1")}
            >
              {/* Bağlantı çizgisi */}
              {i > 0 ? (
                <div
                  className={cn(
                    "h-0.5 min-w-3 flex-1 rounded-full",
                    done ? "bg-success-500" : "bg-zinc-200",
                  )}
                />
              ) : null}
              <div
                title={label}
                className={cn(
                  "flex size-6 shrink-0 items-center justify-center rounded-full border-2 transition",
                  done
                    ? "border-success-500 bg-success-500 text-white"
                    : current
                      ? "border-brand-500 bg-brand-50 text-brand-700 ring-4 ring-brand-500/15"
                      : "border-zinc-200 bg-white text-zinc-300",
                )}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  <span className="text-[10px] font-bold">{i + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Tek satır, tam metin — kırpılma yok */}
      <p className="mt-1.5 flex items-baseline gap-1.5 text-xs">
        <span
          className={cn(
            "font-semibold",
            isDone ? "text-success-700" : "text-brand-700",
          )}
        >
          {STAGES[isDone ? STAGES.length - 1 : active]}
        </span>
        <span className="text-zinc-400">
          · {isDone ? STAGES.length : active + 1}/{STAGES.length}
        </span>
        {!isDone && active + 1 < STAGES.length ? (
          <span className="hidden truncate text-zinc-400 sm:inline">
            → {STAGES[active + 1]}
          </span>
        ) : null}
      </p>
    </div>
  );
}

const SORT_OPTIONS = [
  { value: "newest", label: "En Yeni" },
  { value: "oldest", label: "En Eski" },
  { value: "amount_desc", label: "Tutar (Yüksek → Düşük)" },
  { value: "amount_asc", label: "Tutar (Düşük → Yüksek)" },
];

const STATUS_FILTERS: { value: string; label: string }[] = [
  { value: "all", label: "Tümü" },
  { value: "PENDING", label: "Onay Bekliyor" },
  { value: "ACCEPTED", label: "Onaylandı" },
  { value: "IN_DELIVERY", label: "Gönderildi / Hazır" },
  { value: "DELIVERED", label: "Teslim Alındı" },
  { value: "COMPLETED", label: "Tamamlandı" },
  { value: "DISPUTED", label: "İhtilaflı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal Edildi" },
];

type RangeKey = "all" | "7d" | "30d" | "3m" | "12m";
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "12m", label: "Son 1 Yıl" },
];
const RANGE_DAYS: Record<RangeKey, number | null> = {
  all: null,
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "12m": 365,
};

function matchesSearch(o: CompanyOrder, q: string) {
  if (!q) return true;
  return (
    (o.listingTitle ?? "").toLocaleLowerCase("tr").includes(q) ||
    (o.number ?? "").toLocaleLowerCase("tr").includes(q) ||
    o.counterparty.toLocaleLowerCase("tr").includes(q)
  );
}

function sym(currency: string | undefined): string {
  return (
    CURRENCY_SYMBOL[(currency as keyof typeof CURRENCY_SYMBOL) ?? "TRY"] ?? "₺"
  );
}

/**
 * Kaynak rozeti + açıklaması — PORTALA GÖRE anlamlandırılır (ham "Alış
 * İhalesi/Satış İlanı" etiketi kafa karıştırıyordu: alıcı portalında "Satış
 * İlanı" gören kullanıcı kendi alışını satış sanıyordu).
 *  - Alıcı: ALIM → "Kendi İhalem", SATIS → "Satın Alım"
 *  - Satıcı: SATIS → "Satış İlanım", ALIM → "Kazanılan İhale"
 * İlan silinmişse (listingType null) nötr "İlan silinmiş" gösterilir —
 * etiketi hiç olmayan sipariş kalmaz.
 */
function sourceMeta(
  role: "buyer" | "seller",
  type: "ALIM" | "SATIS" | null,
): { label: string; hint: string; cls: string } {
  if (!type) {
    return {
      label: "İlan silinmiş",
      hint: "Bu siparişin bağlı olduğu ilan kaydı artık yok.",
      cls: "border-zinc-200 bg-zinc-50 text-zinc-500",
    };
  }
  if (role === "buyer") {
    return type === "ALIM"
      ? {
          label: "Kendi İhalem",
          hint: "Açtığın alış ihalesini kazandırdın — bu onun siparişi.",
          cls: "border-blue-200 bg-blue-50 text-blue-700",
        }
      : {
          label: "Satın Alım",
          hint: "Bir satıcının satış ilanından satın aldın.",
          cls: "border-violet-200 bg-violet-50 text-violet-700",
        };
  }
  return type === "SATIS"
    ? {
        label: "Satış İlanım",
        hint: "Açtığın satış ilanını kazandırdın — bu onun siparişi.",
        cls: "border-emerald-200 bg-emerald-50 text-emerald-700",
      }
    : {
        label: "Kazanılan İhale",
        hint: "Bir alıcının ihalesine verdiğin teklif kazandı.",
        cls: "border-blue-200 bg-blue-50 text-blue-700",
      };
}

/** Tek satırlık sipariş kutusu (İhalelerim listesiyle aynı desen). */
function OrderRow({ o, role }: { o: CompanyOrder; role: "buyer" | "seller" }) {
  const { active, lastDone, isTerminated } = getStageState(o.status);
  const src = sourceMeta(role, o.listingType);
  // Teslim şekli: satıcı taşımıyorsa (EXW/fabrika teslim…) orta adım "Teslime Hazır".
  const sellerShips = sellerShipsGoods(o.deliveryTerm);

  return (
    <Link
      href={`/company/siparis/${o.id}`}
      className="group block rounded-2xl border border-zinc-200 bg-white p-4 transition-all hover:border-brand-300 hover:shadow-md sm:p-5"
    >
      <div className="flex flex-col gap-3 lg:flex-row lg:items-center">
        {/* Sol: kimlik + kaynak */}
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="tabular-nums text-[11px] tracking-wide text-zinc-500">
              {o.number ?? "—"}
            </span>
            <span
              title={src.hint}
              className={cn(
                "inline-flex items-center whitespace-nowrap rounded-full border px-2 py-0.5 text-[11px] font-semibold",
                src.cls,
              )}
            >
              {src.label}
            </span>
            <StatusBadge tone={orderStatusMeta(o.status, sellerShips).tone}>
              {orderStatusMeta(o.status, sellerShips).label}
            </StatusBadge>
            {/* Yaşam döngüsü ayrımı: ödeme durumu operasyonel durumdan ayrı.
                P0: VADESİ GEÇMİŞ ödeme normal "Ödeme bekliyor" ile piksel
                piksel aynı görünüyordu — gecikme danger rozetle ayrışır. */}
            {o.paymentSettled === false &&
            !["CANCELLED", "REJECTED", "DISPUTED"].includes(o.status) ? (
              (() => {
                const overdueDays = o.paymentDueDate
                  ? Math.floor(
                      (Date.now() - new Date(o.paymentDueDate).getTime()) /
                        86_400_000,
                    )
                  : null;
                if (overdueDays != null && overdueDays > 0) {
                  return (
                    <span className="inline-flex items-center rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs font-semibold text-red-700">
                      Ödeme gecikti · {overdueDays} gün
                    </span>
                  );
                }
                return (
                  <span className="inline-flex items-center rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                    Ödeme bekliyor
                    {o.paymentDueDate
                      ? ` · Vade ${new Date(o.paymentDueDate).toLocaleDateString("tr-TR")}`
                      : ""}
                  </span>
                );
              })()
            ) : null}
          </div>
          <p className="mt-1 truncate font-semibold leading-snug text-zinc-900 group-hover:text-brand-700">
            {o.listingTitle ?? "—"}
          </p>
          {/* Kaynak açıklaması — rozetin uzun hali; kafa karışıklığını bitirir. */}
          <p className="mt-0.5 truncate text-xs text-zinc-500">
            {src.hint}
            {o.listingNumber ? (
              <span className="ml-1 font-mono text-zinc-400">
                ({o.listingNumber})
              </span>
            ) : null}
          </p>
          <p className="mt-1 flex items-center gap-1.5 text-sm text-zinc-600">
            <Building2
              className="h-3.5 w-3.5 flex-shrink-0 text-zinc-400"
              aria-hidden="true"
            />
            <span className="truncate font-medium">
              {role === "buyer" ? "Satıcı: " : "Alıcı: "}
              {o.counterparty}
            </span>
          </p>
        </div>

        {/* Orta: aşama göstergesi */}
        <div className="w-full shrink-0 lg:w-80">
          {!isTerminated ? (
            <StageStepper
              active={active}
              lastDone={lastDone}
              stages={stagesFor(sellerShips)}
            />
          ) : (
            <div
              className={cn(
                "flex items-center gap-2 rounded-lg border px-3 py-2 text-xs font-medium",
                o.status === "REJECTED"
                  ? "border-orange-200 bg-orange-50 text-orange-700"
                  : "border-zinc-200 bg-zinc-50 text-zinc-600",
              )}
            >
              <CircleSlash className="size-4 shrink-0" aria-hidden />
              {o.status === "REJECTED"
                ? "Sipariş reddedildi"
                : "Sipariş iptal edildi"}
            </div>
          )}
        </div>

        {/* Sağ: tutar + tarih */}
        <div className="flex shrink-0 items-center justify-between gap-4 lg:w-40 lg:flex-col lg:items-end lg:justify-center lg:gap-1">
          {/* P1 (denetim §8.1): tek para formatı — kuruş görünür, sembol sonda. */}
          <p className="whitespace-nowrap font-mono text-base font-bold tabular-nums text-success-700">
            {formatMoney(o.amount, o.currency)}
          </p>
          <p className="whitespace-nowrap text-xs text-zinc-400">
            {format(new Date(o.createdAt), "d MMM yyyy", { locale: tr })}
          </p>
        </div>
      </div>
    </Link>
  );
}

function CardSkeleton() {
  return (
    <div className="rounded-2xl border border-zinc-200 bg-white p-5">
      <div className="h-3 w-20 animate-pulse rounded bg-zinc-100" />
      <div className="mt-2 h-5 w-2/3 animate-pulse rounded bg-zinc-100" />
      <div className="mt-4 flex justify-between">
        <div className="h-4 w-28 animate-pulse rounded bg-zinc-100" />
        <div className="h-4 w-16 animate-pulse rounded bg-zinc-100" />
      </div>
      <div className="mt-4 h-1.5 w-full animate-pulse rounded-full bg-zinc-100" />
    </div>
  );
}

export function OrdersList({ role }: { role: "buyer" | "seller" }) {
  const { data, isLoading, isError, refetch } = useOrders();
  const isSeller = role === "seller";
  const partyPlural = isSeller ? "Alıcılar" : "Tedarikçiler";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState<RangeKey>("all");
  const [counterparty, setCounterparty] = useState("");
  // Kaynak ilan tipi: kendi ihalemden mi (ALIM) satış ilanından mı (SATIS).
  const [srcType, setSrcType] = useState("all");
  const [page, setPage] = useState(1);

  const all = useMemo(
    () => (data ?? []).filter((o) => o.role === role),
    [data, role],
  );

  const counts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const o of all) c[o.status] = (c[o.status] ?? 0) + 1;
    return c;
  }, [all]);

  const counterparties = useMemo(
    () =>
      [...new Set(all.map((o) => o.counterparty))].sort((a, b) =>
        a.localeCompare(b, "tr"),
      ),
    [all],
  );

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    const minDate = days ? Date.now() - days * 86_400_000 : null;
    const q = search.trim().toLocaleLowerCase("tr");
    const rows = all.filter((o) => {
      if (status !== "all" && o.status !== status) return false;
      if (srcType !== "all" && o.listingType !== srcType) return false;
      if (counterparty && o.counterparty !== counterparty) return false;
      if (minDate && new Date(o.createdAt).getTime() < minDate) return false;
      if (q && !matchesSearch(o, q)) return false;
      return true;
    });
    const out = [...rows];
    if (sort === "oldest") {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sort === "amount_desc") {
      out.sort((a, b) => Number(b.amount) - Number(a.amount));
    } else if (sort === "amount_asc") {
      out.sort((a, b) => Number(a.amount) - Number(b.amount));
    } else {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return out;
  }, [all, status, srcType, counterparty, range, search, sort]);

  const isFiltered =
    search !== "" ||
    status !== "all" ||
    srcType !== "all" ||
    range !== "all" ||
    counterparty !== "";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const reset =
    <T,>(setter: (v: T) => void) =>
    (v: T) => {
      setPage(1);
      setter(v);
    };

  // KPI şeridi (eski panel paritesi).
  const kpis = useMemo(() => {
    const active = all.filter((o) =>
      ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status),
    ).length;
    // Yaşam döngüsü ayrımı: "Ödeme Bekleyen" artık DELIVERED sayısı DEĞİL —
    // türetilen ödeme durumundan (paymentSettled=false), status'tan bağımsız.
    // Terminal/ihtilaf hariç (borç kapanmamış canlı siparişler).
    const awaitingPayment = all.filter(
      (o) =>
        o.paymentSettled === false &&
        !["CANCELLED", "REJECTED", "DISPUTED"].includes(o.status),
    ).length;
    const completed = counts["COMPLETED"] ?? 0;
    return { active, awaitingPayment, completed };
  }, [all, counts]);

  const emptyHint = isSeller
    ? "Henüz satış siparişin yok. Bir satış ilanın veya ihale teklifin kazandığında burada görünür."
    : "Henüz alış siparişin yok. Bir ihaleni kazandırdığında veya satın aldığında burada görünür.";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title={isSeller ? "Satışlarım" : "Siparişlerim"}
        description={
          isSeller
            ? "Satışların — kazandığın ihalelerden ve satışlarından. Onayla, gönder, ödemeyi takip et."
            : "Alış siparişlerin — kazandırdığın ihalelerden ve satın almalarından. Teslim al, ödemeni bildir, tamamla."
        }
      />

      {/* KPI şeridi — tıklayınca ilgili durum filtresi uygulanır */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] sm:grid-cols-4">
        {(
          [
            { label: "Toplam Sipariş", value: String(all.length), filter: "all" },
            { label: "Aktif", value: String(kpis.active), filter: null },
            {
              // Ödeme durumu türetilir; status filtresi değil (bilgi amaçlı sayım).
              label: "Ödeme Bekleyen",
              value: String(kpis.awaitingPayment),
              filter: null,
            },
            {
              label: "Tamamlanan",
              value: String(kpis.completed),
              filter: "COMPLETED",
            },
          ] as const
        ).map((k) => (
          <button
            key={k.label}
            type="button"
            disabled={!k.filter}
            onClick={() => k.filter && reset(setStatus)(k.filter)}
            className={cn(
              "bg-white p-4 text-left",
              k.filter && "cursor-pointer transition-colors hover:bg-zinc-50",
              k.filter && status === k.filter && "bg-brand-50/60",
            )}
          >
            <dt className="text-[11px] font-semibold uppercase tracking-wide text-slate-500">
              {k.label}
            </dt>
            <dd className="mt-0.5 truncate text-lg font-bold tabular-nums text-zinc-900">
              {k.value}
            </dd>
          </button>
        ))}
      </dl>

      {/* Arama + filtreler — kutusuz, pill-tarzı */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={reset(setSearch)}
            placeholder="Sipariş no, ilan veya karşı taraf…"
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={reset(setSort)}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "newest"}
            className="sm:min-w-[200px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={ListFilter}
            value={status}
            onChange={reset(setStatus)}
            options={STATUS_FILTERS.map((s) => ({
              value: s.value,
              label:
                s.value === "all"
                  ? `Tümü (${all.length})`
                  : `${s.label}${counts[s.value] ? ` (${counts[s.value]})` : ""}`,
            }))}
            ariaLabel="Durum filtresi"
            active={status !== "all"}
          />
          <FilterSelect
            icon={Package}
            value={srcType}
            onChange={reset(setSrcType)}
            options={
              // Kaynak filtresi portala göre adlandırılır (ham tip adı kafa
              // karıştırıyordu) — değerler yine listingType.
              isSeller
                ? [
                    { value: "all", label: "Tüm Kaynaklar" },
                    { value: "SATIS", label: "Satış İlanlarımdan" },
                    { value: "ALIM", label: "Kazanılan İhalelerden" },
                  ]
                : [
                    { value: "all", label: "Tüm Kaynaklar" },
                    { value: "ALIM", label: "Kendi İhalelerimden" },
                    { value: "SATIS", label: "Satın Alımlarım" },
                  ]
            }
            ariaLabel="Sipariş kaynağı"
            active={srcType !== "all"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => reset(setRange)(v as RangeKey)}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== "all"}
          />
          <FilterSelect
            icon={Users}
            value={counterparty}
            onChange={reset(setCounterparty)}
            options={[
              { value: "", label: `Tüm ${partyPlural}` },
              ...counterparties.map((c) => ({ value: c, label: c })),
            ]}
            ariaLabel="Karşı taraf filtresi"
            active={counterparty !== ""}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit="sipariş"
            className="ml-auto"
          />
        </div>
      </div>

      {/* Liste — satır başına tek sipariş (İhalelerim deseni) */}
      {isLoading && all.length === 0 ? (
        <div className="flex flex-col gap-3">
          {Array.from({ length: 5 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : isError && all.length === 0 ? (
        <ErrorState
          message="Siparişler yüklenemedi. Lütfen tekrar deneyin."
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white">
          <EmptyState
            icon={isFiltered ? CircleSlash : Package}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen sipariş yok" : "Henüz sipariş yok"}
            description={
              isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint
            }
            action={
              isFiltered ? (
                /* P2 (denetim §5): filtre yüzünden boşsa TEK TIK temizleme. */
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatus("all");
                    setSrcType("all");
                    setRange("all");
                    setCounterparty("");
                    setPage(1);
                  }}
                  className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  Filtreleri Temizle
                </button>
              ) : (
                <Link
                  href={
                    isSeller
                      ? "/company/satis/acik-ihaleler"
                      : "/company/satinalma/ihalelerim"
                  }
                  className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  {isSeller ? "Açık İhalelere Göz At" : "İhalelerime Git"}
                </Link>
              )
            }
          />
        </div>
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pageRows.map((o) => (
              <OrderRow key={o.id} o={o} role={role} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
