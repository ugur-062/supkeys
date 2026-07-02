"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  EmptyState,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  SearchInput,
} from "@/components/list";
import { useSellerTenders, type SellerTenderRow } from "@/hooks/use-seller-tenders";
import {
  closingUrgency,
  deriveSellerTenderState,
} from "@/lib/tenders/seller-state";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  Calendar,
  ClipboardList,
  FileText,
  Lock,
} from "lucide-react";
import Link from "next/link";
import { useMemo, useState } from "react";

const PAGE_SIZE = 20;

const SORT_OPTIONS = [
  { value: "closing-asc", label: "Yakın Biten" },
  { value: "closing-desc", label: "Uzak Biten" },
  { value: "newest", label: "En Yeni" },
];
const TAB_OPTIONS = [
  { value: "active", label: "Aktif" },
  { value: "past", label: "Geçmiş" },
  { value: "all", label: "Tümü" },
];
const RANGE_OPTIONS = [
  { value: "all", label: "Tüm Zamanlar" },
  { value: "7", label: "Son 7 gün" },
  { value: "30", label: "Son 30 gün" },
  { value: "90", label: "Son 3 ay" },
  { value: "180", label: "Son 6 ay" },
  { value: "365", label: "Son 1 yıl" },
];

function isPast(status: string): boolean {
  return status !== "OPEN";
}

/** Eski tedarikçi TenderCard'ının zinc/Catalyst portu (iki yön). */
export function SellerTenderCard({
  tender,
  listingType = "ALIM",
}: {
  tender: SellerTenderRow;
  listingType?: "ALIM" | "SATIS";
}) {
  const isSatis = listingType === "SATIS";
  const state = deriveSellerTenderState(
    tender.status,
    tender.myBidStatus,
    tender.invited,
  );
  const urgency = closingUrgency(tender.status, tender.closesAt);
  const fromHref = isSatis
    ? "/company/satinalma/satin-al"
    : "/company/satis/acik-ihaleler";
  const fromLabel = isSatis ? "Satın Al" : "Açık İhaleler";

  return (
    <Link
      href={`/company/ilan/${tender.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(fromLabel)}`}
      className="group block"
    >
      <div className="flex h-full flex-col rounded-2xl border border-zinc-950/10 bg-white p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <p className="font-mono text-[11px] text-zinc-500">
              {tender.number ?? "—"}
            </p>
            <h3 className="mt-0.5 line-clamp-2 leading-snug font-semibold text-zinc-950">
              {tender.title}
            </h3>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-md border px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap",
              state.className,
            )}
          >
            {state.label}
          </span>
        </div>

        <div className="mb-3 flex min-w-0 items-center gap-2 text-sm text-zinc-600">
          {tender.owner ? (
            <>
              <Building2
                className="h-3.5 w-3.5 shrink-0 text-zinc-400"
                aria-hidden="true"
              />
              <span className="truncate">{tender.owner.name}</span>
            </>
          ) : (
            <>
              <Lock
                className="h-3.5 w-3.5 shrink-0 text-amber-500"
                aria-hidden="true"
              />
              <span className="truncate text-zinc-500 italic">Gizli firma</span>
              <span className="inline-flex items-center rounded border border-amber-200 bg-amber-50 px-1.5 py-0.5 text-[10px] font-semibold text-amber-700">
                Premium
              </span>
            </>
          )}
        </div>

        <div className="mb-3 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
          <Badge color="zinc">{tender.currency}</Badge>
          {tender.format === "ENGLISH_AUCTION" ? (
            <Badge color="purple">
              {isSatis ? "Açık Artırma" : "İngiliz Usulü"}
            </Badge>
          ) : (
            <Badge color="zinc">Teklif Toplama</Badge>
          )}
          {isSatis && tender.minPrice ? (
            <Badge color="emerald">
              Taban {Number(tender.minPrice).toLocaleString("tr-TR")}
            </Badge>
          ) : null}
          {isSatis && tender.buyNowPrice ? (
            <Badge color="amber">
              Hemen-Al {Number(tender.buyNowPrice).toLocaleString("tr-TR")}
            </Badge>
          ) : null}
          {tender.visibility === "PUBLIC" ? (
            <Badge color="green">Herkese Açık</Badge>
          ) : null}
          {tender.categoryMatch ? (
            <Badge color="blue">Kategorine Uygun</Badge>
          ) : null}
          {tender.categories.map((c) => (
            <Badge key={c.code} color="zinc">
              {c.name}
            </Badge>
          ))}
          {tender.extraCategoryCount > 0 ? (
            <span className="text-[11px] text-zinc-400">
              +{tender.extraCategoryCount}
            </span>
          ) : null}
          <span className="inline-flex items-center gap-1">
            <FileText className="h-3 w-3" aria-hidden="true" />
            {tender.itemCount} kalem
          </span>
          {tender.myBidVersion && tender.myBidVersion > 1 ? (
            <span className="inline-flex items-center rounded bg-zinc-100 px-1.5 py-0.5 font-mono text-[10px] text-zinc-600">
              v{tender.myBidVersion}
            </span>
          ) : null}
        </div>

        <div className="mt-auto flex items-center justify-between border-t border-zinc-100 pt-3 text-xs">
          <div
            className={cn(
              "flex items-center gap-1.5",
              urgency?.className ?? "text-zinc-500",
            )}
          >
            <Calendar className="h-3 w-3" aria-hidden="true" />
            <span>
              {tender.closesAt
                ? format(new Date(tender.closesAt), "dd MMM HH:mm", {
                    locale: tr,
                  })
                : "—"}
            </span>
          </div>
          {urgency ? (
            <span className={cn("font-semibold", urgency.className)}>
              {urgency.text}
            </span>
          ) : null}
        </div>
      </div>
    </Link>
  );
}

/**
 * Satıcı İhaleler listesi — eski tedarikçi paneli paritesi: durum tabı
 * (Aktif/Geçmiş/Tümü) + sıralama + tarih aralığı + müşteri + kategori filtresi,
 * zengin kartlar (durum rozeti, aciliyet, kategori eşleşme, teklif versiyonu).
 */
export function SellerTendersView({
  listingType = "ALIM",
}: {
  /** SATIS: alıcının "Satın Al" listesi — satış ilanlarına teklif verilir. */
  listingType?: "ALIM" | "SATIS";
} = {}) {
  const isSatis = listingType === "SATIS";
  const tenders = useSellerTenders(listingType);
  const [search, setSearch] = useState("");
  const [tab, setTab] = useState("active");
  const [sort, setSort] = useState("closing-asc");
  const [range, setRange] = useState("all");
  const [buyer, setBuyer] = useState("all");
  const [category, setCategory] = useState("all");
  const [page, setPage] = useState(1);

  const all = tenders.data ?? [];

  // Müşteri + kategori seçenekleri veriden türetilir (sayaçlı).
  const buyerOptions = useMemo(() => {
    const counts = new Map<string, number>();
    for (const t of all) {
      if (!t.owner) continue;
      counts.set(t.owner.name, (counts.get(t.owner.name) ?? 0) + 1);
    }
    return [
      { value: "all", label: isSatis ? "Tüm Satıcılar" : "Tüm Müşteriler" },
      ...[...counts.entries()]
        .sort((a, b) => b[1] - a[1])
        .map(([name, n]) => ({ value: name, label: `${name} (${n})` })),
    ];
  }, [all]);

  const categoryOptions = useMemo(() => {
    const counts = new Map<string, { name: string; n: number }>();
    for (const t of all) {
      for (const c of t.categories) {
        const e = counts.get(c.code) ?? { name: c.name, n: 0 };
        e.n += 1;
        counts.set(c.code, e);
      }
    }
    return [
      { value: "all", label: "Tüm Kategoriler" },
      ...[...counts.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([code, e]) => ({ value: code, label: `${e.name} (${e.n})` })),
    ];
  }, [all]);

  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = range === "all" ? null : Number(range) * 86_400_000;
    const rows = all.filter((t) => {
      if (tab === "active" && isPast(t.status)) return false;
      if (tab === "past" && !isPast(t.status)) return false;
      if (rangeMs !== null && now - new Date(t.createdAt).getTime() > rangeMs)
        return false;
      if (buyer !== "all" && t.owner?.name !== buyer) return false;
      if (category !== "all" && !t.categories.some((c) => c.code === category))
        return false;
      if (search) {
        const q = search.toLocaleLowerCase("tr-TR");
        const hay = `${t.title} ${t.number ?? ""} ${t.owner?.name ?? ""}`
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const time = (iso: string | null) =>
      iso ? new Date(iso).getTime() : Number.MAX_SAFE_INTEGER;
    rows.sort((a, b) => {
      // Kategori eşleşenler her sıralamada üstte (özellikle maskeli önizlemede
      // standart üyeye "senin kategorinde ihale var" sinyali).
      if (a.categoryMatch !== b.categoryMatch) return a.categoryMatch ? -1 : 1;
      if (sort === "newest")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      if (sort === "closing-desc") return time(b.closesAt) - time(a.closesAt);
      return time(a.closesAt) - time(b.closesAt);
    });
    return rows;
  }, [all, tab, sort, range, buyer, category, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const isFiltered =
    search !== "" || buyer !== "all" || category !== "all" || range !== "all";

  function withReset<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <PageHeader
        title={isSatis ? "Satın Al" : "İhaleler"}
        description={
          isSatis
            ? "Bağlı olduğun satıcıların ve herkese açık satış ihalelerinin listesi — teklif ver ya da Hemen Al, sonuçları takip et."
            : "Bağlı olduğun alıcı firmaların ve herkese açık ihalelerin listesi — teklif ver, sonuçları takip et."
        }
      />

      <div className="flex flex-wrap items-center gap-2">
        <SearchInput
          value={search}
          onChange={withReset(setSearch)}
          placeholder="İhale ara…"
          className="w-full sm:w-64"
        />
        <FilterSelect
          value={tab}
          onChange={withReset(setTab)}
          options={TAB_OPTIONS}
          ariaLabel="Durum"
          active={tab !== "active"}
        />
        <FilterSelect
          value={sort}
          onChange={withReset(setSort)}
          options={SORT_OPTIONS}
          ariaLabel="Sıralama"
          active={sort !== "closing-asc"}
        />
        <FilterSelect
          value={range}
          onChange={withReset(setRange)}
          options={RANGE_OPTIONS}
          ariaLabel="Tarih aralığı"
          active={range !== "all"}
        />
        <FilterSelect
          value={buyer}
          onChange={withReset(setBuyer)}
          options={buyerOptions}
          ariaLabel={isSatis ? "Satıcı" : "Müşteri"}
          active={buyer !== "all"}
        />
        <FilterSelect
          value={category}
          onChange={withReset(setCategory)}
          options={categoryOptions}
          ariaLabel="Kategori"
          active={category !== "all"}
        />
        <span className="ml-auto text-xs text-zinc-400">
          {filtered.length} ihale{isFiltered ? " (filtrelenmiş)" : ""}
        </span>
      </div>

      {tenders.isLoading ? (
        <ListSkeleton rows={5} />
      ) : tenders.isError ? (
        <EmptyState
          icon={ClipboardList}
          title="İhaleler yüklenemedi"
          description="Bir hata oluştu — lütfen sayfayı yenileyin."
          variant="no-results"
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={isFiltered ? "Sonuç bulunamadı" : "Henüz ihale yok"}
          description={
            isFiltered
              ? "Filtrelerinizi değiştirerek tekrar deneyin."
              : isSatis
                ? "Satıcılarla bağlantı kurduğunda veya alım kategorine uygun herkese açık satış ihalesi yayınlandığında burada görünür."
                : "Alıcılarla bağlantı kurduğunda veya kategorine uygun herkese açık ihale yayınlandığında burada görünür."
          }
          variant={isFiltered ? "no-results" : "no-data"}
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {pageRows.map((t) => (
              <SellerTenderCard key={t.id} tender={t} listingType={listingType} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              page={safePage}
              totalPages={totalPages}
              total={filtered.length}
              pageSize={PAGE_SIZE}
              onPageChange={setPage}
              variant="bare"
            />
          ) : null}
        </>
      )}
    </div>
  );
}
