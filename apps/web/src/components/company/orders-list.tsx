"use client";

import {
  EmptyState,
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import {
  useOrders,
  type CompanyOrder,
  type CompanyOrderStatus,
} from "@/hooks/use-company-orders";
import { CURRENCY_SYMBOL } from "@/lib/tenders/labels";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  CircleSlash,
  ListFilter,
  Package,
  Users,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 12;

/** Statü pill meta — eski sistemden. */
const STATUS_META: Record<
  CompanyOrderStatus,
  { label: string; pill: string }
> = {
  PENDING: {
    label: "Onay Bekliyor",
    pill: "bg-warning-50 text-warning-700 border-warning-200",
  },
  ACCEPTED: {
    label: "Onaylandı",
    pill: "bg-brand-50 text-brand-700 border-brand-200",
  },
  CREATED: {
    label: "Yeni",
    pill: "bg-zinc-100 text-zinc-700 border-zinc-200",
  },
  IN_DELIVERY: {
    label: "Gönderildi",
    pill: "bg-indigo-50 text-indigo-700 border-indigo-200",
  },
  DELIVERED: {
    label: "Ödeme Bekleniyor",
    pill: "bg-amber-50 text-amber-700 border-amber-200",
  },
  COMPLETED: {
    label: "Tamamlandı",
    pill: "bg-success-50 text-success-700 border-success-200",
  },
  REJECTED: {
    label: "Reddedildi",
    pill: "bg-orange-50 text-orange-700 border-orange-200",
  },
  CANCELLED: {
    label: "İptal Edildi",
    pill: "bg-danger-50 text-danger-700 border-danger-200",
  },
};

function OrderStatusBadge({ status }: { status: CompanyOrderStatus }) {
  const meta = STATUS_META[status] ?? STATUS_META.CREATED;
  return (
    <span
      className={cn(
        "inline-flex items-center whitespace-nowrap rounded-full border px-2.5 py-1 text-xs font-semibold",
        meta.pill,
      )}
    >
      {meta.label}
    </span>
  );
}

// 5 aşamalı akış: Onay → Onaylandı → Kargoda → Teslim alındı → Tamamlandı.
const STAGES = [
  "Onay",
  "Onaylandı",
  "Gönderildi",
  "Teslim Alındı",
  "Tamamlandı",
];

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
  { value: "IN_DELIVERY", label: "Gönderildi" },
  { value: "DELIVERED", label: "Ödeme Bekleniyor" },
  { value: "COMPLETED", label: "Tamamlandı" },
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

function OrderCard({ o }: { o: CompanyOrder }) {
  const { active, lastDone, isTerminated } = getStageState(o.status);

  return (
    <Link
      href={`/company/siparis/${o.id}`}
      className="group block rounded-2xl border border-zinc-200 bg-white p-5 transition-all hover:border-brand-300 hover:shadow-md"
    >
      {/* Üst: no + başlık + statü */}
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1">
          <p className="font-mono text-[11px] tracking-wide text-zinc-500">
            {o.number ?? "—"}
          </p>
          <p className="mt-0.5 line-clamp-2 font-semibold leading-snug text-zinc-900 group-hover:text-brand-700">
            {o.listingTitle ?? "—"}
          </p>
        </div>
        <OrderStatusBadge status={o.status} />
      </div>

      {/* Karşı taraf + tutar */}
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2 text-sm text-zinc-600">
          <Building2 className="h-4 w-4 flex-shrink-0 text-zinc-400" />
          <span className="truncate font-medium">{o.counterparty}</span>
        </div>
        <p className="whitespace-nowrap font-mono text-base font-bold tabular-nums text-success-700">
          {Number(o.amount).toLocaleString("tr-TR")} {sym(o.currency)}
        </p>
      </div>

      {/* Aşama çubuğu */}
      {!isTerminated ? (
        <div className="mb-3 space-y-1.5">
          <div className="flex items-center gap-1">
            {STAGES.map((_, i) => (
              <div
                key={i}
                className={cn(
                  "h-1.5 flex-1 rounded-full transition",
                  i === active
                    ? "bg-brand-500"
                    : i <= lastDone
                      ? "bg-success-500"
                      : "bg-zinc-200",
                )}
              />
            ))}
          </div>
          <div className="flex items-center justify-between gap-1 text-[10px] font-medium tracking-tight text-zinc-500">
            {STAGES.map((label, i) => (
              <span
                key={label}
                className={cn(
                  "flex-1 truncate text-center first:text-left last:text-right",
                  i === active && "text-brand-700",
                  i < active && "text-success-700",
                )}
              >
                {label}
              </span>
            ))}
          </div>
        </div>
      ) : (
        <div className="mb-3 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-2 text-[11px] text-zinc-600">
          {o.status === "REJECTED"
            ? "Sipariş reddedildi"
            : "Sipariş iptal edildi"}
        </div>
      )}

      {/* Alt: ilan no + tarih */}
      <div className="flex items-center justify-between gap-3 border-t border-zinc-100 pt-2 text-xs text-zinc-500">
        <span className="truncate font-mono">{o.listingNumber ?? "—"}</span>
        <span className="whitespace-nowrap">
          {format(new Date(o.createdAt), "d MMM yyyy", { locale: tr })}
        </span>
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
  const { data, isLoading } = useOrders();
  const isSeller = role === "seller";
  const partyPlural = isSeller ? "Alıcılar" : "Tedarikçiler";

  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("all");
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState<RangeKey>("all");
  const [counterparty, setCounterparty] = useState("");
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
    search !== "" || status !== "all" || range !== "all" || counterparty !== "";
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

  // KPI şeridi (eski panel paritesi). Tutar toplamı para birimine göre gruplu.
  const kpis = useMemo(() => {
    const active = all.filter((o) =>
      ["PENDING", "ACCEPTED", "CREATED", "IN_DELIVERY"].includes(o.status),
    ).length;
    const awaitingPayment = counts["DELIVERED"] ?? 0;
    const completed = counts["COMPLETED"] ?? 0;
    const sums = new Map<string, number>();
    for (const o of all) {
      if (o.status === "REJECTED" || o.status === "CANCELLED") continue;
      const cur = o.currency ?? "TRY";
      sums.set(cur, (sums.get(cur) ?? 0) + Number(o.amount));
    }
    const totalLabel =
      sums.size === 0
        ? `0 ${sym("TRY")}`
        : [...sums.entries()]
            .sort((a, b) => b[1] - a[1])
            .map(([c, v]) => `${v.toLocaleString("tr-TR")} ${sym(c)}`)
            .join(" · ");
    return { active, awaitingPayment, completed, totalLabel };
  }, [all, counts]);

  const emptyHint = isSeller
    ? "Henüz satış siparişin yok. Bir satış ilanın veya ihale teklifin kazandığında burada görünür."
    : "Henüz alım siparişin yok. Bir ihaleni kazandırdığında veya satın aldığında burada görünür.";

  return (
    <div className="mx-auto max-w-6xl space-y-6">
      <PageHeader
        title="Siparişlerim"
        description={
          isSeller
            ? "Satış siparişlerin — kazandığın ihalelerden ve satışlarından. Onayla, kargoya ver, ödemeyi takip et."
            : "Alım siparişlerin — kazandırdığın ihalelerden ve satın almalarından. Teslim al, ödemeyi kaydet, tamamla."
        }
      />

      {/* KPI şeridi — tıklayınca ilgili durum filtresi uygulanır */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-2xl border border-zinc-950/5 bg-zinc-950/[0.06] sm:grid-cols-3 lg:grid-cols-5">
        {(
          [
            { label: "Toplam Sipariş", value: String(all.length), filter: "all" },
            { label: "Aktif", value: String(kpis.active), filter: null },
            {
              label: "Ödeme Bekleyen",
              value: String(kpis.awaitingPayment),
              filter: "DELIVERED",
            },
            {
              label: "Tamamlanan",
              value: String(kpis.completed),
              filter: "COMPLETED",
            },
            { label: "Toplam Tutar", value: kpis.totalLabel, filter: null },
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

      {/* Liste — kart ızgarası */}
      {isLoading && all.length === 0 ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <CardSkeleton key={i} />
          ))}
        </div>
      ) : filtered.length === 0 ? (
        <div className="overflow-hidden rounded-2xl border border-zinc-950/10 bg-white">
          <EmptyState
            icon={isFiltered ? CircleSlash : Package}
            variant={isFiltered ? "no-results" : "no-data"}
            title={isFiltered ? "Eşleşen sipariş yok" : "Henüz sipariş yok"}
            description={
              isFiltered ? "Filtreleri değiştirip tekrar dene." : emptyHint
            }
          />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
            {pageRows.map((o) => (
              <OrderCard key={o.id} o={o} />
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
