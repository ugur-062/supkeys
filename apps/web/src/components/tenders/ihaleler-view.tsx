"use client";

import {
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
  ViewToggle,
} from "@/components/list";
import { LISTING_STATUS_LABELS } from "@/components/tenders/status-badge";
import { OwnerTenderList } from "@/components/tenders/owner-tender-cards";
import { IhaleListView } from "@/components/ihale/IhaleListView";
import { Button } from "@/components/ui/button";
import {
  useTenders,
  type TenderListItem,
} from "@/hooks/use-company-tenders";
import { ArrowUpDown, Building2, CalendarRange, Globe, Plus, User as UserIcon } from "lucide-react";
import Link from "next/link";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useEffect, useMemo, useState } from "react";

const SORT_OPTIONS = [
  { value: "createdAt:desc", label: "En Yeni" },
  { value: "createdAt:asc", label: "En Eski" },
  { value: "bidsCloseAt:asc", label: "Yakın Biten" },
  { value: "bidsCloseAt:desc", label: "Uzak Biten" },
];

type RangeKey = "7d" | "30d" | "3m" | "6m" | "12m" | "all";
const RANGE_OPTIONS: { value: RangeKey; label: string }[] = [
  { value: "7d", label: "Son 7 Gün" },
  { value: "30d", label: "Son 30 Gün" },
  { value: "3m", label: "Son 3 Ay" },
  { value: "6m", label: "Son 6 Ay" },
  { value: "12m", label: "Son 1 Yıl" },
  { value: "all", label: "Tümü" },
];
const DEFAULT_RANGE: RangeKey = "3m";
const RANGE_DAYS: Record<RangeKey, number | null> = {
  "7d": 7,
  "30d": 30,
  "3m": 90,
  "6m": 180,
  "12m": 365,
  all: null,
};

type TabKey =
  | "all"
  | "DRAFT"
  | "IN_APPROVAL"
  | "OPEN"
  | "IN_AWARD"
  | "IN_AWARD_APPROVAL"
  | "AWARDED"
  | "CLOSED_NO_AWARD"
  | "CANCELLED";
// IN_AWARD = "Değerlendirmede" — kapanan ihale doğrudan bu duruma geçer
// (ayrı "Teklife Kapalı" ara durumu 2026-07-13'te kaldırıldı).
const STATUS_OPTIONS: { value: TabKey; label: string }[] = [
  { value: "all", label: "Tüm Durumlar" },
  { value: "DRAFT", label: LISTING_STATUS_LABELS.DRAFT },
  { value: "IN_APPROVAL", label: LISTING_STATUS_LABELS.IN_APPROVAL },
  { value: "OPEN", label: LISTING_STATUS_LABELS.OPEN },
  { value: "IN_AWARD", label: LISTING_STATUS_LABELS.IN_AWARD },
  { value: "IN_AWARD_APPROVAL", label: LISTING_STATUS_LABELS.IN_AWARD_APPROVAL },
  { value: "AWARDED", label: LISTING_STATUS_LABELS.AWARDED },
  { value: "CLOSED_NO_AWARD", label: LISTING_STATUS_LABELS.CLOSED_NO_AWARD },
  { value: "CANCELLED", label: LISTING_STATUS_LABELS.CANCELLED },
];

const PAGE_SIZE = 20;

export function IhalelerView({
  listingType = "ALIM",
}: {
  /** SATIS: Satış İlanlarım — aynı zengin liste, satış rotaları/etiketleri. */
  listingType?: "ALIM" | "SATIS";
} = {}) {
  const isSatis = listingType === "SATIS";
  const canCreate = useHasCompanyPermission(
    isSatis ? "sell:listing:create" : "buy:listing:create",
  );
  const list = useTenders(listingType);
  const all = useMemo(() => list.data ?? [], [list.data]);

  const [tab, setTab] = useState<TabKey>("all");
  const [search, setSearch] = useState("");
  const [sort, setSort] = useState("createdAt:desc");
  const [range, setRange] = useState<RangeKey>(DEFAULT_RANGE);
  const [createdById, setCreatedById] = useState("");
  const [scope, setScope] = useState<"all" | "dom" | "intl">("all");
  const [page, setPage] = useState(1);
  // Görünüm: "grid" (kart) | "list" (yoğun satır) — localStorage'da kalıcı.
  const viewStorageKey = isSatis ? "satis_ihaleler_view" : "ihaleler_view";
  const [view, setViewState] = useState<"grid" | "list">("grid");
  useEffect(() => {
    try {
      if (localStorage.getItem(viewStorageKey) === "list")
        setViewState("list");
    } catch {
      /* varsayılan grid */
    }
  }, [viewStorageKey]);
  const setView = (v: "grid" | "list") => {
    setViewState(v);
    try {
      localStorage.setItem(viewStorageKey, v);
    } catch {
      /* kalıcılık olmadan devam */
    }
  };

  // Durum sayaçları — durum DIŞINDAKİ aktif filtrelerle tutarlı (facet):
  // "Tümü (N)" etiketi görünen listeyle aynı evreni saysın.
  const facetRows = useMemo(() => {
    const days = RANGE_DAYS[range];
    const minDate = days ? Date.now() - days * 86_400_000 : null;
    const q = search.trim().toLocaleLowerCase("tr");
    return all.filter((t) => {
      if (createdById && t.createdById !== createdById) return false;
      if (scope !== "all" && t.isInternational !== (scope === "intl"))
        return false;
      if (minDate && new Date(t.createdAt).getTime() < minDate) return false;
      if (
        q &&
        !t.title.toLocaleLowerCase("tr").includes(q) &&
        !t.tenderNumber.toLocaleLowerCase("tr").includes(q)
      )
        return false;
      return true;
    });
  }, [all, createdById, scope, range, search]);
  const stats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of facetRows) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [facetRows]);

  // Açan kişiler (ALIM'da satın almacılar, SATIS'ta satışçılar)
  const buyers = useMemo(() => {
    const m = new Map<
      string,
      { id: string; firstName: string; lastName: string; count: number }
    >();
    for (const t of all) {
      const e = m.get(t.createdById) ?? {
        id: t.createdById,
        firstName: t.createdBy.firstName,
        lastName: t.createdBy.lastName,
        count: 0,
      };
      e.count += 1;
      m.set(t.createdById, e);
    }
    return [...m.values()].sort((a, b) => b.count - a.count);
  }, [all]);

  const filtered = useMemo(() => {
    const days = RANGE_DAYS[range];
    const minDate = days ? Date.now() - days * 86_400_000 : null;
    const q = search.trim().toLocaleLowerCase("tr");
    const rows = all.filter((t) => {
      if (tab !== "all" && t.status !== tab) return false;
      if (createdById && t.createdById !== createdById) return false;
      if (scope !== "all" && t.isInternational !== (scope === "intl"))
        return false;
      if (minDate && new Date(t.createdAt).getTime() < minDate) return false;
      if (
        q &&
        !t.title.toLocaleLowerCase("tr").includes(q) &&
        !t.tenderNumber.toLocaleLowerCase("tr").includes(q)
      )
        return false;
      return true;
    });
    const [field, dir] = sort.split(":") as [keyof TenderListItem, string];
    const DATE_FIELDS = new Set<keyof TenderListItem>([
      "createdAt",
      "bidsCloseAt",
      "publishedAt",
    ]);
    const sorted = [...rows].sort((a, b) => {
      const ra = a[field];
      const rb = b[field];
      // Boş/null değerler yöne bakılmaksızın her zaman sona (ör. "Yakın Biten"
      // sıralamasında bidsCloseAt'i olmayan taslaklar en üste çıkmasın).
      const aEmpty = ra == null || ra === "";
      const bEmpty = rb == null || rb === "";
      if (aEmpty && bEmpty) return 0;
      if (aEmpty) return 1;
      if (bEmpty) return -1;
      if (DATE_FIELDS.has(field)) {
        const at = new Date(ra as string).getTime();
        const bt = new Date(rb as string).getTime();
        return dir === "asc" ? at - bt : bt - at;
      }
      const av = String(ra);
      const bv = String(rb);
      return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
    });
    return sorted;
  }, [all, tab, createdById, scope, range, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const isFiltered =
    Boolean(search) ||
    tab !== "all" ||
    range !== DEFAULT_RANGE ||
    scope !== "all" ||
    Boolean(createdById);
  // Backend en fazla 500 kayıt döndürür (listTenders take).
  const atCap = all.length >= 500;

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1);
    setter(v);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={isSatis ? "Satış İhalelerim" : "İhaleler"}
        description={
          isSatis
            ? "Satış ihalelerinizi yönetin — açın, alıcı davet edin, en yüksek teklife kazandırın."
            : "Tedarik süreçlerinizi yönetin — açın, davet gönderin, kazandırın."
        }
        action={
          // F7: ilan açma buy|sell:listing:create ister (yalnız SA/ST taşır) —
          // etiket-only gözetimde buton görünmez; liste salt-okunur kalır.
          canCreate ? (
            <Link
              href={
                isSatis
                  ? "/company/satis/ilanlarim/yeni"
                  : "/company/satinalma/ihalelerim/yeni"
              }
            >
              <Button variant="primary">
                <Plus className="h-4 w-4" />
                {isSatis ? "Yeni Satış İhalesi" : "Yeni İhale Aç"}
              </Button>
            </Link>
          ) : undefined
        }
      />

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          En fazla 500 ihale gösteriliyor — daha fazlası varsa arama ve
          filtrelerle daraltın.
        </div>
      ) : null}

      {/* Arama + filtreler */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={reset(setSearch)}
            placeholder="İhale adı veya numarası ara…"
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={reset(setSort)}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "createdAt:desc"}
            className="sm:min-w-[150px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={Building2}
            value={tab}
            onChange={(v) => reset(setTab)(v as TabKey)}
            options={STATUS_OPTIONS.map((o) => ({
              value: o.value,
              label:
                o.value === "all"
                  ? `Tümü (${facetRows.length})`
                  : `${o.label}${stats[o.value] ? ` (${stats[o.value]})` : ""}`,
            }))}
            ariaLabel="Durum filtresi"
            active={tab !== "all"}
          />
          <FilterSelect
            icon={Globe}
            value={scope}
            onChange={(v) => reset(setScope)(v as "all" | "dom" | "intl")}
            options={[
              { value: "all", label: "Tüm Kapsamlar" },
              { value: "dom", label: "Yurtiçi" },
              { value: "intl", label: "Yurtdışı" },
            ]}
            ariaLabel="Kapsam filtresi"
            active={scope !== "all"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => reset(setRange)(v as RangeKey)}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== DEFAULT_RANGE}
          />
          <FilterSelect
            icon={UserIcon}
            value={createdById}
            onChange={reset(setCreatedById)}
            options={[
              {
                value: "",
                label: isSatis ? "Tüm Satışçılar" : "Tüm Satın Almacılar",
              },
              ...buyers.map((b) => ({
                value: b.id,
                label: `${b.firstName} ${b.lastName} (${b.count})`,
              })),
            ]}
            ariaLabel={isSatis ? "Satışçı filtresi" : "Satın almacı filtresi"}
            active={!!createdById}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit="ihale"
            className="ml-auto"
          />
          <ViewToggle
            view={view === "grid" ? "cards" : "table"}
            onChange={(v) => setView(v === "cards" ? "grid" : "list")}
          />
        </div>
      </div>

      {view === "list" ? (
        <IhaleListView
          items={pageRows}
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={() => list.refetch()}
          listingType={listingType}
          emptyCtaLabel={isSatis ? "Yeni Satış İhalesi" : "Yeni İhale Aç"}
        />
      ) : (
        <OwnerTenderList
          items={pageRows}
          isLoading={list.isLoading}
          isError={list.isError}
          onRetry={() => list.refetch()}
          listingType={listingType}
          emptyCtaLabel={isSatis ? "Yeni Satış İhalesi" : "Yeni İhale Aç"}
        />
      )}

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
    </div>
  );
}
