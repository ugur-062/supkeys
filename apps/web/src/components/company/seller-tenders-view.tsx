"use client";

import { useTranslations } from "next-intl";
import { SECTOR_EDIT_HREF } from "@/lib/company/portals";
import { useListingTerms } from "@/i18n/domain";
import { EmptyState, ListSkeleton, Pagination } from "@/components/list";
import { BrowseTenderRow } from "@/components/ihale/BrowseTenderRow";
import {
  FilterResults,
  FilterShellCore,
  MobileFilterButton,
  ResultCount,
  useFilters,
} from "@/components/marketplace/filter-shell";
import { RequestActiveChips, RequestFilters, RequestSortControl } from "@/components/company/request-filters";
import { useCategorySegments } from "@/hooks/use-portal-discovery";
import { LockedRequestsCard } from "@/components/company/locked-requests-card";
import { useLockedRequestsSummary, useSellerTenders, type LockedRequestsSummary, type SellerTenderRow } from "@/hooks/use-seller-tenders";
import { passes, requestFacets, sortRequests, type RequestFacets } from "@/lib/company/request-facets";
import {
  activeRequestFilterCount,
  buildRequestFilterQuery,
  clearRequestFilters,
  parseRequestFilters,
  type RequestFilterState,
} from "@/lib/company/request-filter-params";
import { ClipboardList } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { useSearchParams } from "next/navigation";
import { useMemo, type ReactNode } from "react";

const PAGE_SIZE = 20;
/** Liste satış ANASAYFASINDA yaşar; süzgeç durumu bu yolun sorgusunda. */
const BASE = "/company/satis";

/**
 * AÇIK TALEPLER — satış anasayfasına gömülü, kenar süzgeçli liste
 * (2026-09-05, kullanıcı: "talepler gözüksün ve iyi bir filtreleme olsun").
 *
 *  · Durum URL'de (`request-filter-params`): hero `?q=` yazar, kenar süzgeci
 *    diğer anahtarları; geri tuşu süzgeci geri alır, adres paylaşılabilir.
 *  · Süzme/sıralama/sayaç istemcide (`request-facets`): uç zaten tüm listeyi
 *    verir (tavan 300), sayaçlar bağlamsal.
 *  · Ürün Ara ile AYNI kabuk (`FilterShellCore`) ve AYNI yapı taşları —
 *    iki liste bir daha görsel olarak ayrışmasın.
 *  · Kendi arama kutusu YOK: en üstteki kutu (hero) ile aynı sayfada ikinci
 *    kutu tekrar oluyordu; arama burada yalnız çip.
 */
export function SellerTendersView({ banner }: { banner?: ReactNode } = {}) {
  const tenders = useSellerTenders();
  // Ücretsiz üye: herkese açık talepler listede YOK; kilit kartı gerçek sayıyı verir.
  const lockedSummary = useLockedRequestsSummary();
  const locked = lockedSummary.data?.locked ? lockedSummary.data : null;
  const segments = useCategorySegments();
  // `useSearchParams` sunucu-öncesi render ve test ortamında NULL dönebilir.
  const sp = useSearchParams();
  const state = parseRequestFilters(sp ?? new URLSearchParams());
  // Durum her render'da yeni nesne — memo anahtarı olarak URL sorgusu.
  const key = buildRequestFilterQuery(state);

  const all = useMemo(() => tenders.data ?? [], [tenders.data]);
  // "Şimdi" veri geldikçe tazelenir (liste 15 sn'de bir yenilenir) — her
  // render'da Date.now() olsaydı memo'lar hiç tutmazdı.
  const now = useMemo(() => Date.now(), [all]); // eslint-disable-line react-hooks/exhaustive-deps
  const segmentNames = useMemo(
    () => new Map((segments.data ?? []).map((s) => [s.id, s.nameTr] as const)),
    [segments.data],
  );
  const facets = useMemo(
    () => requestFacets(all, state, segmentNames, now),
    [all, key, segmentNames, now], // eslint-disable-line react-hooks/exhaustive-deps
  );
  const filtered = useMemo(
    () => sortRequests(all.filter((r) => passes(r, state, now)), state.sort),
    [all, key, now], // eslint-disable-line react-hooks/exhaustive-deps
  );

  return (
    <FilterShellCore
      state={state}
      toUrl={(next) => `${BASE}${buildRequestFilterQuery(next)}`}
      clearState={clearRequestFilters}
      total={filtered.length}
      activeCount={activeRequestFilterCount(state)}
      drawer={tenders.isLoading ? null : <RequestFilters facets={facets} idPrefix="m" />}
    >
      <RequestList
        state={state}
        rows={filtered}
        facets={facets}
        banner={banner}
        locked={locked}
        atCap={all.length >= 300}
        isLoading={tenders.isLoading}
        isError={tenders.isError}
        refetch={() => void tenders.refetch()}
      />
    </FilterShellCore>
  );
}

function RequestList({
  state,
  rows,
  facets,
  banner,
  locked,
  atCap,
  isLoading,
  isError,
  refetch,
}: {
  state: RequestFilterState;
  rows: SellerTenderRow[];
  facets: RequestFacets;
  banner?: ReactNode;
  /** Ücretsiz üyenin kilit özeti (paketliye null). */
  locked: Extract<LockedRequestsSummary, { locked: true }> | null;
  atCap: boolean;
  isLoading: boolean;
  isError: boolean;
  refetch: () => void;
}) {
  const tr = useTranslations("web.panel.trade.sellerTendersView");
  // Kayıt tipi sözlüğü: başkalarının AÇIK TALEPLERİ — satış tarafında tek terim.
  const t = useListingTerms("ACIK_TALEP");
  const { update, clear } = useFilters<RequestFilterState>();
  const totalPages = Math.max(1, Math.ceil(rows.length / PAGE_SIZE));
  const safePage = Math.min(state.page, totalPages);
  const pageRows = rows.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);
  const isFiltered = !!state.q || activeRequestFilterCount(state) > 0;

  return (
    <section id="acik-talepler" aria-labelledby="acik-talepler-baslik" className="scroll-mt-20 space-y-4">
      <div>
        <h2 id="acik-talepler-baslik" className="text-lg font-semibold tracking-tight text-zinc-950">
          {t.title}
        </h2>
        <p className="mt-1 text-sm text-zinc-500">
          {locked
            ? tr("bagliOldugunuzAlicilarinTalepleriHerkese")
            : tr("bagliOldugunuzAlicilarinVeHerkese")}
        </p>
      </div>

      {locked ? <LockedRequestsCard summary={locked} /> : null}

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {tr("enFazla300GosteriliyorDaha", { unit: t.unit })}
        </div>
      ) : null}

      {/* AI arama bandı — "AI şöyle anladı" + çipler (sayfa verir). */}
      {banner}

      <RequestActiveChips facets={facets} />

      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[15rem_1fr]">
        <aside
          aria-label={tr("suzgecler")}
          className="hidden lg:sticky lg:top-24 lg:block lg:max-h-[calc(100vh-7rem)] lg:self-start lg:overflow-y-auto lg:overscroll-contain lg:pr-2 [scrollbar-width:thin]"
        >
          {isLoading ? (
            <p className="text-sm text-zinc-500">{tr("suzgeclerYukleniyor")}</p>
          ) : (
            <RequestFilters facets={facets} idPrefix="d" />
          )}
        </aside>

        <div className="min-w-0">
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
            <span className="flex items-center gap-3">
              <MobileFilterButton />
              <ResultCount noun={t.unit} />
            </span>
            <RequestSortControl />
          </div>

          <FilterResults>
            {isLoading ? (
              <ListSkeleton rows={5} />
            ) : isError ? (
              <div className="space-y-3">
                <EmptyState
                  icon={ClipboardList}
                  title={tr("acikTaleplerYuklenemedi")}
                  description={tr("birHataOlustuTekrarDeneyin")}
                  variant="no-results"
                />
                <div className="text-center">
                  <button
                    type="button"
                    onClick={refetch}
                    className="rounded-lg border border-zinc-300 px-3 py-1.5 text-sm font-medium text-zinc-700 hover:bg-zinc-50"
                  >
                    {tr("tekrarDene")}
                  </button>
                </div>
              </div>
            ) : rows.length === 0 ? (
              <EmptyState
                icon={ClipboardList}
                title={
                  isFiltered
                    ? tr("sonucBulunamadi")
                    : state.status === "aktif"
                      ? tr("aktifYok", { unit: t.unit })
                      : tr("henuzYok", { unit: t.unit })
                }
                description={
                  isFiltered
                    ? tr("suzgecleriniziDegistirerekTekrarDeneyin")
                    : state.status === "aktif"
                      ? tr("kapananlarIcinDurumGecmis")
                      : tr("kategorinizeUygunTalepYayinlandigindaBurada")
                }
                variant={isFiltered ? "no-results" : "no-data"}
                action={
                  isFiltered ? (
                    <button
                      type="button"
                      onClick={clear}
                      className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {tr("filtreleriTemizle")}
                    </button>
                  ) : (
                    /* Satışta TEK eylem: eşleşme kategori beyanına dayanır —
                       doğru düzeltme sektörleri güncellemek. */
                    <Link
                      href={SECTOR_EDIT_HREF}
                      className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
                    >
                      {tr("satisKategorileriniDuzenle")}
                    </Link>
                  )
                }
              />
            ) : (
              <>
                <div className="space-y-2" role="table" aria-label={tr("listesi", { noun: t.searchNoun })}>
                  {pageRows.map((row) => (
                    <BrowseTenderRow key={row.id} t={row} />
                  ))}
                </div>
                {totalPages > 1 ? (
                  <Pagination
                    page={safePage}
                    totalPages={totalPages}
                    total={rows.length}
                    pageSize={PAGE_SIZE}
                    onPageChange={(page) => update({ page })}
                    variant="bare"
                  />
                ) : null}
              </>
            )}
          </FilterResults>
        </div>
      </div>
    </section>
  );
}
