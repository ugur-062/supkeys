"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  EmptyState,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
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
  ArrowUpDown,
  Building2,
  Calendar,
  CalendarRange,
  ClipboardList,
  FileText,
  ListFilter,
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
      aria-label={`${tender.number ?? ""} ${tender.title}`.trim()}
      className="group block"
    >
      <div
        className={cn(
          "relative flex h-full flex-col overflow-hidden rounded-2xl border border-zinc-950/10 bg-white p-5 pl-6 shadow-sm transition-all duration-200 hover:-translate-y-0.5 hover:shadow-lg",
          isSatis ? "hover:border-violet-300" : "hover:border-emerald-300",
        )}
      >
        {/* Sol aksan şeridi — karşı taraf ilanı (satın al: mor, açık ihale: yeşil) */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1",
            isSatis
              ? "bg-gradient-to-b from-violet-500 to-violet-300"
              : "bg-gradient-to-b from-emerald-500 to-emerald-300",
          )}
        />
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <span className="rounded-md bg-zinc-100 px-1.5 py-0.5 tabular-nums text-[11px] font-medium text-zinc-600">
              {tender.number ?? "—"}
            </span>
            <h3
              className={cn(
                "mt-1.5 line-clamp-2 text-[15px] leading-snug font-semibold text-zinc-950 transition-colors",
                isSatis
                  ? "group-hover:text-violet-700"
                  : "group-hover:text-emerald-700",
              )}
            >
              {tender.title}
            </h3>
          </div>
          <span
            className={cn(
              "inline-flex shrink-0 items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold whitespace-nowrap",
              state.className,
            )}
          >
            {state.label}
          </span>
        </div>

        <div className="mb-3 flex min-w-0 items-center gap-2 text-sm text-zinc-600">
          {tender.owner ? (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-zinc-100">
                <Building2
                  className="h-3.5 w-3.5 text-zinc-500"
                  aria-hidden="true"
                />
              </span>
              <span className="truncate font-medium">{tender.owner.name}</span>
            </>
          ) : (
            <>
              <span className="flex size-6 shrink-0 items-center justify-center rounded-md bg-amber-50">
                <Lock
                  className="h-3.5 w-3.5 text-amber-500"
                  aria-hidden="true"
                />
              </span>
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
              Pazarlık
            </Badge>
          ) : (
            <Badge color="zinc">Teklif Toplama</Badge>
          )}
          {isSatis && tender.priceScope === "KALEM" ? (
            <Badge color="emerald">Kalem Bazlı Fiyat</Badge>
          ) : null}
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
          {tender.invited ? (
            <Badge color="amber">Davetlisiniz</Badge>
          ) : null}
          {!tender.invited && tender.connected ? (
            <Badge color="purple">Bağlantılı</Badge>
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
          <div className="flex items-center gap-1.5 text-zinc-500">
            <Calendar className="h-3.5 w-3.5 text-zinc-400" aria-hidden="true" />
            <span>
              {tender.closesAt
                ? `Kapanış ${format(new Date(tender.closesAt), "dd MMM HH:mm", {
                    locale: tr,
                  })}`
                : "—"}
            </span>
          </div>
          {urgency ? (
            <span
              className={cn(
                "rounded-full bg-current/10 px-2.5 py-1 font-semibold whitespace-nowrap",
                urgency.className,
              )}
            >
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
  const [page, setPage] = useState(1);

  const all = useMemo(() => tenders.data ?? [], [tenders.data]);

  // Müşteri + kategori seçenekleri veriden türetilir (sayaçlı).
  const buyerOptions = useMemo(() => {
    // Aynı adlı iki firma karışmasın diye ID bazlı gruplanır.
    const counts = new Map<string, { name: string; n: number }>();
    for (const t of all) {
      // Eski cache satırlarında owner.id olmayabilir — key çakışması üretme.
      if (!t.owner?.id) continue;
      const e = counts.get(t.owner.id) ?? { name: t.owner.name, n: 0 };
      e.n += 1;
      counts.set(t.owner.id, e);
    }
    return [
      { value: "all", label: isSatis ? "Tüm Satıcılar" : "Tüm Müşteriler" },
      ...[...counts.entries()]
        .sort((a, b) => b[1].n - a[1].n)
        .map(([id, e]) => ({ value: id, label: `${e.name} (${e.n})` })),
    ];
  }, [all, isSatis]);


  const filtered = useMemo(() => {
    const now = Date.now();
    const rangeMs = range === "all" ? null : Number(range) * 86_400_000;
    const rows = all.filter((t) => {
      if (tab === "active" && isPast(t.status)) return false;
      if (tab === "past" && !isPast(t.status)) return false;
      if (rangeMs !== null && now - new Date(t.createdAt).getTime() > rangeMs)
        return false;
      if (buyer !== "all" && t.owner?.id !== buyer) return false;
      if (search) {
        const q = search.toLocaleLowerCase("tr-TR");
        const hay = `${t.title} ${t.number ?? ""} ${t.owner?.name ?? ""}`
          .toLocaleLowerCase("tr-TR");
        if (!hay.includes(q)) return false;
      }
      return true;
    });
    const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
    rows.sort((a, b) => {
      // Öncelik (seçilen sıralama modunun ÜSTÜNDE):
      //   1) DAVET EDİLENLER (beni özel çağıran — en güçlü sinyal)
      //   2) BAĞLANTILI firma ihaleleri (iş ilişkim olan firma)
      //   3) Kategori eşleşenler (sektörüme uygun herkese açık)
      if (a.invited !== b.invited) return a.invited ? -1 : 1;
      if (a.connected !== b.connected) return a.connected ? -1 : 1;
      if (a.categoryMatch !== b.categoryMatch) return a.categoryMatch ? -1 : 1;
      if (sort === "newest")
        return (
          new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
        );
      // Kapanışı olmayanlar yönden bağımsız SONA (desc'te başa sıçramasın).
      const ta = time(a.closesAt);
      const tb = time(b.closesAt);
      if (ta === null && tb === null) return 0;
      if (ta === null) return 1;
      if (tb === null) return -1;
      return sort === "closing-desc" ? tb - ta : ta - tb;
    });
    return rows;
  }, [all, tab, sort, range, buyer, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const isFiltered = search !== "" || buyer !== "all" || range !== "all";
  // Backend en fazla 300 kayıt döndürür; sınıra ulaşıldıysa kullanıcı bilsin.
  const atCap = all.length >= 300;

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

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          En fazla 300 ihale gösteriliyor — daha fazlası varsa arama ve
          filtrelerle daraltın.
        </div>
      ) : null}

      {/* Arama + filtreler — İhalelerim düzeni: üstte tam-genişlik arama +
          sıralama, altta filtre pill'leri + sonuç sayacı. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={withReset(setSearch)}
            placeholder="İhale adı, numarası veya firma ara…"
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={withReset(setSort)}
            options={SORT_OPTIONS}
            ariaLabel="Sıralama"
            active={sort !== "closing-asc"}
            className="sm:min-w-[160px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterSelect
            icon={ListFilter}
            value={tab}
            onChange={withReset(setTab)}
            options={TAB_OPTIONS}
            ariaLabel="Durum"
            active={tab !== "active"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={withReset(setRange)}
            options={RANGE_OPTIONS}
            ariaLabel="Tarih aralığı"
            active={range !== "all"}
          />
          <FilterSelect
            icon={Building2}
            value={buyer}
            onChange={withReset(setBuyer)}
            options={buyerOptions}
            ariaLabel={isSatis ? "Satıcı" : "Müşteri"}
            active={buyer !== "all"}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            unit="ihale"
            className="ml-auto"
          />
        </div>
      </div>

      {tenders.isLoading ? (
        <ListSkeleton rows={5} />
      ) : tenders.isError ? (
        <div className="space-y-3">
          <EmptyState
            icon={ClipboardList}
            title="İhaleler yüklenemedi"
            description="Bir hata oluştu — tekrar deneyin."
            variant="no-results"
          />
          <div className="text-center">
            <button
              type="button"
              onClick={() => tenders.refetch()}
              className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
            >
              Tekrar dene
            </button>
          </div>
        </div>
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={isFiltered ? "Sonuç bulunamadı" : "Henüz ihale yok"}
          description={
            isFiltered
              ? "Filtrelerinizi değiştirerek tekrar deneyin."
              : isSatis
                ? "Satıcılarla bağlantı kurduğunda veya alış kategorine uygun herkese açık satış ihalesi yayınlandığında burada görünür."
                : "Alıcılarla bağlantı kurduğunda veya kategorine uygun herkese açık ihale yayınlandığında burada görünür."
          }
          variant={isFiltered ? "no-results" : "no-data"}
          action={
            isFiltered ? (
              /* P2 (denetim §5): filtre yüzünden boşsa TEK TIK temizleme. */
              <button
                type="button"
                onClick={() => {
                  setSearch("");
                  setBuyer("all");
                  setRange("all");
                  setPage(1);
                }}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                Filtreleri Temizle
              </button>
            ) : (
              <Link
                href={
                  isSatis
                    ? "/company/satinalma/tedarikcilerim"
                    : "/company/satis/musterilerim"
                }
                className="inline-flex items-center rounded-lg bg-zinc-900 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
              >
                Bağlantı Kur
              </Link>
            )
          }
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
