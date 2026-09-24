"use client";

import { useTranslations } from "next-intl";
import { useNavLabel } from "@/i18n/domain";
import { formatDate } from "@/lib/format-date";
import { MODULE_LABELS } from "@/lib/company/portals";
import {
  ActiveFilterChips,
  EmptyState,
  FilterMultiSelect,
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
  ViewToggle,
  useListView,
} from "@/components/list";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
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
import { orderStageIndex, orderStatusMeta, orderSteps, type OrderStepKey } from "@/lib/orders/order-status";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  Check,
  CircleSlash,
  ClipboardList,
  ListFilter,
  Package,
  Users,
} from "lucide-react";
import { Link } from "@/i18n/navigation";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { useSearchParams } from "next/navigation";
import { useMemo, useState } from "react";

const PAGE_SIZE = 12;

// 4 kilometre taşı — TEK kaynaktan (order-status.orderSteps / orderStageIndex);
// etiket PAYLAŞILAN katalogdan (`web.domain.orderStep.<KEY>`; satıcı taşımıyorsa
// SHIP → SHIP_PICKUP "Hazırlık").
const stepKey = (key: OrderStepKey, sellerShips: boolean) =>
  key === "SHIP" && !sellerShips ? "SHIP_PICKUP" : key;

/**
 * Durum rozeti metni PAYLAŞILAN katalogdan (`web.domain.orderStatus.<KOD>`,
 * sipariş detayıyla aynı sözlük); IN_DELIVERY teslim şekline duyarlı (alıcı
 * toplarsa "Teslime Hazır"). Bilinmeyen kod `orderStatusMeta` yedeğine düşer.
 */
function useOrderStatusLabel() {
  const t = useTranslations("web.domain.orderStatus");
  return (status: CompanyOrderStatus, sellerShips: boolean) => {
    const key = status === "IN_DELIVERY" && !sellerShips ? "IN_DELIVERY_PICKUP" : status;
    return t.has(key as never) ? t(key as never) : orderStatusMeta(status, sellerShips).label;
  };
}

/**
 * Aşama göstergesi — ikonlu nokta stepper + tek satır özet. Biten adımlar
 * yeşil tikli, süren adım mavi halkalı; adlar kısa (Onay · Gönderim · Teslim
 * · Tamamlandı) olduğundan hepsi yazılır, durumun kendisi rozette.
 */
function StageStepper({
  done: doneCount,
  current,
  sellerShips,
}: {
  done: number;
  current: number;
  sellerShips: boolean;
}) {
  const t = useTranslations("web.panel.trade.ordersList");
  const ts = useTranslations("web.domain.orderStep");
  const STAGES = orderSteps(sellerShips).map((s) => ts(stepKey(s.key, sellerShips) as never));
  const isDone = doneCount >= STAGES.length;
  return (
    <div>
      <div className="flex items-center">
        {STAGES.map((label, i) => {
          const done = i < doneCount;
          const isCurrent = !isDone && i === current;
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
                    : isCurrent
                      ? "border-brand-500 bg-zinc-100 text-brand-700 ring-4 ring-brand-500/15"
                      : "border-zinc-200 bg-white text-zinc-300",
                )}
              >
                {done ? (
                  <Check className="size-3.5" strokeWidth={3} aria-hidden />
                ) : (
                  <span className="text-xs font-bold">{i + 1}</span>
                )}
              </div>
            </div>
          );
        })}
      </div>
      {/* Tek satır özet: süren adım · ilerleme · sıradaki */}
      <p className="mt-1.5 flex items-baseline gap-2 text-xs">
        <span className={cn("font-semibold", isDone ? "text-success-700" : "text-brand-700")}>
          {isDone ? t("tamamlandi") : t("suruyor", { item: STAGES[current] })}
        </span>
        <span className="text-zinc-500">
          · {Math.min(doneCount, STAGES.length)}/{STAGES.length}
        </span>
        {!isDone && current + 1 < STAGES.length ? (
          <span className="hidden truncate text-zinc-500 sm:inline">→ {STAGES[current + 1]}</span>
        ) : null}
      </p>
    </div>
  );
}

// `labelKey` katalog anahtarı — seçenek listeleri bileşende `t(labelKey)` ile çizilir.
const SORT_OPTIONS = [
  { value: "newest", labelKey: "sort.newest" },
  { value: "oldest", labelKey: "sort.oldest" },
  { value: "amount_desc", labelKey: "sort.amount_desc" },
  { value: "amount_asc", labelKey: "sort.amount_asc" },
];

// Çoklu seçim (2026-09-10): "Tümü" satırını FilterMultiSelect kendisi ekler.
// Etiket paylaşılan durum sözlüğünden; IN_DELIVERY iki hâli birden kapsadığı
// için dosyaya özel `statusFilter.IN_DELIVERY` ("Gönderildi / Hazır").
const STATUS_FILTERS: { value: CompanyOrderStatus; filterKey?: string }[] = [
  { value: "PENDING" },
  { value: "ACCEPTED" },
  { value: "IN_DELIVERY", filterKey: "statusFilter.IN_DELIVERY" },
  { value: "DELIVERED" },
  { value: "COMPLETED" },
  { value: "DISPUTED" },
  { value: "REJECTED" },
  { value: "CANCELLED" },
];

type RangeKey = "all" | "7d" | "30d" | "3m" | "12m";
const RANGE_OPTIONS: { value: RangeKey; labelKey: string }[] = [
  { value: "all", labelKey: "range.all" },
  { value: "7d", labelKey: "range.d7" },
  { value: "30d", labelKey: "range.d30" },
  { value: "3m", labelKey: "range.d3m" },
  { value: "12m", labelKey: "range.d12m" },
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
 * Sipariş kartı — yeniden tasarım (2026-09-10, kullanıcı: "çok iyi durmuyor").
 *
 * Eski kart dört çipi (no · kaynak · durum · ödeme) tek satıra diziyor, altına
 * başlık, altına kaynağın UZUN açıklamasını ("Açtığınız satın alma talebini
 * kazandırdınız — bu onun siparişi") tekrar basıyordu. Satış ilanı kalktığı
 * için kaynak TEK: alıcıda kendi talebi, satıcıda kazanılan talep — rozet ve
 * cümle bilgi taşımıyordu, kaldırıldı; talep numarası tek satırda karşı
 * tarafın yanında.
 *
 * Düzen: SOL kimlik (no · tarih / başlık / karşı taraf · talep), SAĞ karar
 * bilgisi (durum rozeti / tutar / ödeme satırı), ALTTA aşama izleyici tam
 * genişlik. İptal/red durumunda izleyici yerine tek satır not.
 */
function OrderRow({ o, role }: { o: CompanyOrder; role: "buyer" | "seller" }) {
  const t = useTranslations("web.panel.trade.ordersList");
  const statusLabel = useOrderStatusLabel();
  const { done, current, terminated: isTerminated } = orderStageIndex(o.status);
  // Teslim şekli: satıcı taşımıyorsa (EXW/fabrika teslim…) orta adım "Hazırlık".
  const sellerShips = sellerShipsGoods(o.deliveryTerm);
  const meta = orderStatusMeta(o.status, sellerShips);
  const overdueDays =
    o.paymentSettled === false && o.paymentDueDate
      ? Math.floor((Date.now() - new Date(o.paymentDueDate).getTime()) / 86_400_000)
      : null;
  const showPayment =
    o.paymentSettled === false && !["CANCELLED", "REJECTED", "DISPUTED"].includes(o.status);

  return (
    <Link
      href={`/company/siparis/${o.id}`}
      className="group block rounded-xl border border-zinc-950/10 bg-white transition hover:border-zinc-950/25 hover:shadow-sm"
    >
      <div className="flex flex-col gap-4 p-4 sm:flex-row sm:items-start sm:justify-between sm:p-5">
        {/* SOL — kimlik */}
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-x-2 text-xs text-zinc-500">
            <span className="tabular-nums font-medium text-zinc-700">{o.number ?? "—"}</span>
            <span aria-hidden>·</span>
            <span>{formatDate(o.createdAt, "short")}</span>
          </p>
          <p className="mt-1 truncate text-base font-semibold leading-snug text-zinc-950 group-hover:underline">
            {o.listingTitle ?? t("siparis")}
          </p>
          {/* Referans çipleri (2026-09-10, kullanıcı: "Talep ROT-… çok düz"):
              karşı taraf ve bağlı talep, ikonlu iki çip — numara koyu, etiket
              soluk. Kart zaten bağlantı; çip içinde ikinci link yok. */}
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            <span className="inline-flex max-w-full items-center gap-1.5 rounded-md border border-zinc-950/10 bg-white px-2 py-1 text-xs">
              <Building2 className="size-3.5 shrink-0 text-zinc-500" aria-hidden />
              <span className="text-zinc-500">{role === "buyer" ? t("satici") : t("alici")}</span>
              <span className="truncate font-medium text-zinc-900">{o.counterparty}</span>
            </span>
            {o.listingNumber ? (
              <span className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs">
                <ClipboardList className="size-3.5 shrink-0 text-zinc-600" aria-hidden />
                <span className="text-zinc-600">{t("talep")}</span>
                <span className="tabular-nums font-semibold text-zinc-900">{o.listingNumber}</span>
              </span>
            ) : !o.listingType ? (
              <span
                className="inline-flex items-center gap-1.5 rounded-md bg-zinc-100 px-2 py-1 text-xs text-zinc-600"
                title={t("buSiparisinBagliOlduguTalep")}
              >
                <ClipboardList className="size-3.5 shrink-0" aria-hidden />
                {t("talepSilinmis")}
              </span>
            ) : null}
          </div>
        </div>

        {/* SAĞ — durum · tutar · ödeme */}
        <div className="flex shrink-0 flex-row items-center justify-between gap-3 sm:w-52 sm:flex-col sm:items-end sm:gap-1">
          <StatusBadge tone={meta.tone}>{statusLabel(o.status, sellerShips)}</StatusBadge>
          {/* P1 (denetim §8.1): tek para formatı — kuruş görünür, sembol sonda. */}
          <p className="whitespace-nowrap text-lg font-semibold tabular-nums text-zinc-950">
            {formatMoney(o.amount, o.currency)}
          </p>
          {showPayment ? (
            overdueDays != null && overdueDays > 0 ? (
              /* P0: VADESİ GEÇMİŞ ödeme normal bekleyenle aynı görünmesin. */
              <p className="whitespace-nowrap text-xs font-semibold text-red-700">
                {t("odemeGeciktiGun", { overdueDays: overdueDays })}
              </p>
            ) : (
              <p className="whitespace-nowrap text-xs text-amber-700">
                {t("odemeBekliyor")}
                {o.paymentDueDate ? ` ${t("vade", { formatDate: formatDate(o.paymentDueDate) })}` : ""}
              </p>
            )
          ) : o.paymentSettled === true ? (
            <p className="whitespace-nowrap text-xs text-emerald-700">{t("odemeTamam")}</p>
          ) : null}
        </div>
      </div>

      {/* ALT — aşama izleyici / son durum notu */}
      <div className="border-t border-zinc-950/5 px-4 py-3 sm:px-5">
        {!isTerminated ? (
          <StageStepper done={done} current={current} sellerShips={sellerShips} />
        ) : (
          <p
            className={cn(
              "flex items-center gap-2 text-xs font-medium",
              o.status === "REJECTED" ? "text-orange-700" : "text-zinc-600",
            )}
          >
            <CircleSlash className="size-4 shrink-0" aria-hidden />
            {o.status === "REJECTED" ? t("siparisReddedildi") : t("siparisIptalEdildi")}
          </p>
        )}
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
  const t = useTranslations("web.panel.trade.ordersList");
  const tn = useNavLabel();
  const statusLabel = useOrderStatusLabel();
  const optionLabel = (o: { labelKey: string } | undefined, fallback: string) =>
    o ? t(o.labelKey as never) : fallback;
  const filterLabel = (o: (typeof STATUS_FILTERS)[number] | undefined, fallback: string) =>
    o ? (o.filterKey ? t(o.filterKey as never) : statusLabel(o.value, true)) : fallback;
  const accent = useButtonAccent();
  const { data, isLoading, isError, refetch } = useOrders();
  const isSeller = role === "seller";
  const partyPlural = isSeller ? t("alicilar") : t("tedarikciler");

  const [search, setSearch] = useState("");
  // Faz 4.2 — KPI drill-down: ?status=DELIVERED gibi başlangıç filtresi.
  // `?status=DELIVERED` ya da virgüllü (çoklu seçim).
  const urlStatus = useSearchParams().get("status");
  const [status, setStatus] = useState<string[]>(() =>
    (urlStatus ?? "").split(",").filter((v) => STATUS_FILTERS.some((s) => s.value === v)),
  );
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState<RangeKey>("all");
  const [counterparty, setCounterparty] = useState("");
  const [page, setPage] = useState(1);
  const [view, setView] = useListView(
    isSeller ? "rothern-view-satislar" : "rothern-view-siparisler",
  );

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
      if (status.length > 0 && !status.includes(o.status)) return false;
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
  }, [all, status, counterparty, range, search, sort]);

  const isFiltered =
    search !== "" ||
    status.length > 0 ||
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

  const emptyHint = isSeller
    ? t("henuzSatisSiparisinizYokBir")
    : t("henuzAlisSiparisinizYokBir");

  return (
    <div className="space-y-6">
      <PageHeader
        title={tn(isSeller ? MODULE_LABELS.satis.siparisler : MODULE_LABELS.satinalma.siparisler)}
        description={
          isSeller
            ? t("satislarinizKazandiginizAcikTaleplerdenVe")
            : t("alisSiparislerinizKazandirdiginizSatinAlma")
        }
      />

      {/* KPI şeridi (Toplam/Aktif/Tamamlanan/İptal/Ödeme Bekleyen) KALDIRILDI —
          kullanıcı kararı 2026-09-10, iki portalda da. Durum sayıları hâlâ
          durum süzgeci çiplerinde (`counts`). */}
      {/* Arama + filtreler — kutusuz, pill-tarzı */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={reset(setSearch)}
            placeholder={t("siparisNoIlanVeyaKarsi")}
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={reset(setSort)}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("siralama")}
            active={sort !== "newest"}
            className="sm:min-w-[200px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            icon={ListFilter}
            value={status}
            onChange={reset(setStatus)}
            options={STATUS_FILTERS.map((s) => ({
              value: s.value,
              label: `${filterLabel(s, s.value)}${counts[s.value] ? ` (${counts[s.value]})` : ""}`,
            }))}
            allLabel={t("tumu", { length: all.length })}
            ariaLabel={t("durumFiltresi")}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => reset(setRange)(v as RangeKey)}
            options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("tarihAraligi")}
            active={range !== "all"}
          />
          <FilterSelect
            icon={Users}
            value={counterparty}
            onChange={reset(setCounterparty)}
            options={[
              { value: "", label: t("tum", { partyPlural: partyPlural }) },
              ...counterparties.map((c) => ({ value: c, label: c })),
            ]}
            ariaLabel={t("karsiTarafFiltresi")}
            active={counterparty !== ""}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit={t("siparis2")}
            isLoading={isLoading}
            className="ml-auto"
          />
          <ViewToggle view={view} onChange={setView} />
        </div>
        <ActiveFilterChips
          filters={[
            ...(search
              ? [
                  {
                    key: "search",
                    label: t("arama", { search: search }),
                    onRemove: () => reset(setSearch)(""),
                  },
                ]
              : []),
            ...status.map((s) => ({
              key: `status:${s}`,
              label: filterLabel(STATUS_FILTERS.find((f) => f.value === s), s),
              onRemove: () => reset(setStatus)(status.filter((x) => x !== s)),
            })),
            ...(range !== "all"
              ? [
                  {
                    key: "range",
                    label: optionLabel(RANGE_OPTIONS.find((r) => r.value === range), range),
                    onRemove: () => reset(setRange)("all"),
                  },
                ]
              : []),
            ...(counterparty
              ? [
                  {
                    key: "cp",
                    label: counterparty,
                    onRemove: () => reset(setCounterparty)(""),
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            setSearch("");
            setStatus([]);
            setRange("all");
            setCounterparty("");
            setPage(1);
          }}
        />
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
          message={t("siparislerYuklenemediLutfenTekrarDeneyin")}
          onRetry={() => refetch()}
        />
      ) : filtered.length === 0 ? (
        <div className="overflow-hidden card">
          <EmptyState
            icon={isFiltered ? CircleSlash : Package}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? t("eslesenSiparisYok") : t("henuzSiparisYok")}
            description={
              isFiltered ? t("filtreleriDegistiripTekrarDene") : emptyHint
            }
            action={
              isFiltered ? (
                /* P2 (denetim §5): filtre yüzünden boşsa TEK TIK temizleme. */
                <button
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setStatus([]);
                    setRange("all");
                    setCounterparty("");
                    setPage(1);
                  }}
                  className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                >
                  {t("filtreleriTemizle")}
                </button>
              ) : (
                <Link
                  href={
                    isSeller
                      ? "/company/satis#acik-talepler"
                      : "/company/satinalma/taleplerim"
                  }
                  className={cn(
                    "inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition",
                    accentFillClass(accent),
                  )}
                >
                  {isSeller ? t("acikTaleplereGozAt") : t("taleplerimeGit")}
                </Link>
              )
            }
          />
        </div>
      ) : view === "table" ? (
        <>
          {/* P2 (denetim §10.2): yoğun tablo — çok kayıtta karşılaştırma. */}
          <div className="card px-2 [--gutter:--spacing(4)]">
            <Table dense>
              <TableHead>
                <TableRow>
                  <TableHeader>{t("no")}</TableHeader>
                  <TableHeader>{t("siparis")}</TableHeader>
                  <TableHeader>{isSeller ? t("alici") : t("satici")}</TableHeader>
                  <TableHeader>{t("durum")}</TableHeader>
                  <TableHeader className="text-right">{t("tutar")}</TableHeader>
                  <TableHeader className="text-right">{t("tarih")}</TableHeader>
                </TableRow>
              </TableHead>
              <TableBody>
                {pageRows.map((o) => {
                  const meta = orderStatusMeta(
                    o.status,
                    sellerShipsGoods(o.deliveryTerm),
                  );
                  return (
                    <TableRow key={o.id}>
                      <TableCell className=" text-xs text-zinc-500 tabular-nums">
                        {o.number ?? "—"}
                      </TableCell>
                      <TableCell className="max-w-64">
                        <Link
                          href={`/company/siparis/${o.id}`}
                          title={o.listingTitle ?? t("siparis")}
                          className="block truncate font-medium text-zinc-900 hover:underline"
                        >
                          {o.listingTitle ?? t("siparis")}
                        </Link>
                      </TableCell>
                      <TableCell className="max-w-48">
                        <span className="block truncate text-zinc-600" title={o.counterparty}>
                          {o.counterparty}
                        </span>
                      </TableCell>
                      <TableCell>
                        <StatusBadge tone={meta.tone}>
                          {statusLabel(o.status, sellerShipsGoods(o.deliveryTerm))}
                        </StatusBadge>
                      </TableCell>
                      <TableCell className="text-right tabular-nums text-zinc-900">
                        {formatMoney(o.amount, o.currency)}
                      </TableCell>
                      <TableCell className="text-right text-zinc-600">
                        {formatDate(o.createdAt, "short")}
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
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
