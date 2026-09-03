"use client";

import { MODULE_LABELS } from "@/lib/company/portals";
import { listingTerms } from "@/lib/company/terms";
import {
  ActiveFilterChips,
  EmptyState,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { BrowseTenderRow } from "@/components/ihale/BrowseTenderRow";
import { useSellerTenders } from "@/hooks/use-seller-tenders";
import {
  ArrowUpDown,
  Building2,
  CalendarRange,
  ClipboardList,
  ListFilter,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";

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
  // Kayıt tipi sözlüğü: SATIS modunda satış İLANLARI (satınalma → Satın Al),
  // ALIM modunda başkalarının AÇIK TALEPLERİ (satış → Açık Talepler). Satış
  // tarafında "satın alma talebi" denmez — tek terim "açık talep".
  const t = listingTerms(isSatis ? "SATIS" : "ACIK_TALEP");
  const tenders = useSellerTenders(listingType);
  // Arama/kategori URL'DEN başlar: pano keşif bloğu buraya `?q=` / `?kategori=`
  // ile devrediyor. URL'siz başlasaydı devredilen terim sessizce kaybolurdu;
  // ayrıca sayfa artık paylaşılabilir/yer imlenebilir.
  // `useSearchParams` sunucu-öncesi render ve test ortamında NULL dönebilir;
  // opsiyonel erişim olmadan bileşen o ortamlarda çöker.
  const sp = useSearchParams();
  const [search, setSearch] = useState(sp?.get("q") ?? "");
  const [tab, setTab] = useState("active");
  const [sort, setSort] = useState("closing-asc");
  const [range, setRange] = useState("all");
  const [buyer, setBuyer] = useState("all");
  const [category, setCategory] = useState(sp?.get("kategori") ?? "");
  useEffect(() => {
    setSearch(sp?.get("q") ?? "");
    setCategory(sp?.get("kategori") ?? "");
    setPage(1);
  }, [sp]);
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
      // Kategori kutusundan gelen segment: ilan kodları o segmentin altında mı
      // (hiyerarşi koddan türer — ilk iki hane segment).
      if (category && /^\d{8}$/.test(category)) {
        const seg = category.slice(0, 2);
        if (!t.categories.some((c) => c.code.slice(0, 2) === seg)) return false;
      }
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
      // İlgi KADEMESİ (kaba) — ham skorla sıralamak kullanıcının seçtiği
      // sıralamayı tamamen ezerdi (skor float, eşitlik neredeyse hiç olmaz).
      // Üç kademe: güçlü / ilgili / gerisi. Kademe içinde kullanıcının
      // seçimi geçerli kalır.
      const tier = (n?: number) => (!n ? 0 : n >= 15 ? 2 : n >= 5 ? 1 : 0);
      const ta2 = tier(a.matchScore);
      const tb2 = tier(b.matchScore);
      if (ta2 !== tb2) return tb2 - ta2;
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
  }, [all, tab, sort, range, buyer, search, category]);

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
    <div className="space-y-6">
      <PageHeader
        title={isSatis ? MODULE_LABELS.satinalma.satinAl : MODULE_LABELS.satis.acikIhaleler}
        description={
          isSatis
            ? "Bağlı olduğunuz satıcıların ve herkese açık satış ilanlarının listesi — teklif verin ya da Hemen Al'ı kullanın, sonuçları takip edin."
            : "Bağlı olduğunuz alıcıların ve herkese açık taleplerin listesi — teklif verin, sonuçları takip edin."
        }
      />

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          En fazla 300 {t.unit} gösteriliyor — daha fazlası varsa arama ve
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
            placeholder={`${t.searchNoun} adı, numarası veya firma ara…`}
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
            unit={t.unit}
            isLoading={tenders.isLoading}
            className="ml-auto"
          />
        </div>
        <ActiveFilterChips
          filters={[
            ...(search
              ? [
                  {
                    key: "search",
                    label: `Arama: "${search}"`,
                    onRemove: () => withReset(setSearch)(""),
                  },
                ]
              : []),
            ...(range !== "all"
              ? [
                  {
                    key: "range",
                    label:
                      RANGE_OPTIONS.find((r) => r.value === range)?.label ??
                      range,
                    onRemove: () => withReset(setRange)("all"),
                  },
                ]
              : []),
            ...(buyer !== "all"
              ? [
                  {
                    key: "buyer",
                    label:
                      buyerOptions.find((b) => b.value === buyer)?.label ??
                      buyer,
                    onRemove: () => withReset(setBuyer)("all"),
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            setSearch("");
            setBuyer("all");
            setRange("all");
            setPage(1);
          }}
        />
      </div>

      {tenders.isLoading ? (
        <ListSkeleton rows={5} />
      ) : tenders.isError ? (
        <div className="space-y-3">
          <EmptyState
            icon={ClipboardList}
            title={isSatis ? "Satış ilanları yüklenemedi." : "Açık talepler yüklenemedi."}
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
          title={
            isFiltered
              ? "Sonuç bulunamadı"
              : tab === "active" && all.length > 0
                ? `Aktif ${t.unit} yok`
                : `Henüz ${t.unit} yok`
          }
          description={
            isFiltered
              ? "Filtrelerinizi değiştirerek tekrar deneyin."
              : tab === "active" && all.length > 0
                ? // C57: "Aktif" sekmesi varsayılan — geçmiş kayıtlar sessizce
                  // gizli kalıyordu, boş durum bunu söylemiyordu.
                  `Şu an açık ${t.indefinite} bulunmuyor. Kapanan ${t.pluralAccusative} görmek için Durum filtresinden Geçmiş'i seçin.`
                : isSatis
                  ? "Satıcılarla bağlantı kurduğunuzda veya alış kategorinize uygun herkese açık satış ilanı yayınlandığında burada görünür."
                  : "Alıcılarla bağlantı kurduğunuzda veya kategorinize uygun herkese açık talep yayınlandığında burada görünür."
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
          {/* Tek görünüm: yoğun satır listesi — İhalelerim ile aynı dil;
              talep sahibi FİRMA kolonu (kullanıcı isteği, 2026-08-03). */}
          <div className="space-y-2" role="table" aria-label={`${t.searchNoun} listesi`}>
            {pageRows.map((t) => (
              <BrowseTenderRow key={t.id} t={t} listingType={listingType} />
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
