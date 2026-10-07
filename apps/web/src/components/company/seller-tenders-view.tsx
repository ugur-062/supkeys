"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { SECTOR_EDIT_HREF } from "@/lib/company/portals";
import { countryDisplayName, useListingTerms } from "@/i18n/domain";
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
import { useSellerTenders, type SellerTenderRow } from "@/hooks/use-seller-tenders";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { PAID_TIER, tierAtLeast } from "@rothern/shared";
import { MaskedSectionLabel } from "@/components/company/masked-section-label";
import {
  passes,
  REQUEST_SCAN_CAPS,
  requestFacets,
  sortRequests,
  type RequestFacets,
} from "@/lib/company/request-facets";
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
import { Fragment, useMemo, type ReactNode } from "react";

const PAGE_SIZE = 20;
/**
 * API tarama tavanları (`REQUEST_SCAN_CAPS`): tavana dayanan kapsamda sayaç
 * "N+" yazar ve bant gösterilir (arayüz testi D-116 — "200 açık talep bulundu"
 * kesin sayı gibi okunuyordu). Başlık ve durum facet'i aynı alt sınır kararını
 * (`facets.statusAtLeast`) okur. Ücretsiz üyede açık talepler İKİ ayrı
 * sorgudan gelir (tam + maskeli, ikisi de 300 tavanlı) — tavan kararı grup
 * başına verilir, toplam üzerinden değil.
 */
const OPEN_SCAN_CAP = REQUEST_SCAN_CAPS.open;
const PAST_SCAN_CAP = REQUEST_SCAN_CAPS.past;
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
 *  · ÜCRETSİZ ÜYE (2026-10-03, kullanıcı kararı: "ücretsiz üyelere bunlar
 *    normal satın alma talebi gibi şirket isimleri gizli şekilde gözükmeli …
 *    en yukarıda bağlantılı üyelerininki gözükmeli"): önce teklif verebildiği
 *    davetli/bağlantılı talepler, ALTINDA aynı satır bileşeniyle alıcı adı
 *    gizli herkese açık talepler (`row.masked`), araya ince bir bölüm etiketi.
 *    Büyük kilit kartı KALDIRILDI. Süzgeç/sayaç/sıralama iki grubu birlikte
 *    sayar; sıralama grup İÇİNDE uygulanır (maskeli satır üste çıkmaz).
 */
export function SellerTendersView({ banner }: { banner?: ReactNode } = {}) {
  const tenders = useSellerTenders();
  // Ücretsiz üye: herkese açık talepler alıcı adı gizli satır olarak listenin altında.
  const tier = useCompanyAuthStore((s) => s.company?.tier);
  const isFree = !tierAtLeast(tier ?? "STANDART", PAID_TIER);
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
  // Alıcı ülkesi etiketleri okuyucunun dilinde (alıcı şehri süzgeci 2026-10-04'te kalktı).
  const locale = useLocale() as Locale;
  const tv = useTranslations("web.panel.trade.sellerTendersView");
  // Kapsam başına tavan: açık, maskeli ve geçmiş ayrı sorgulardan gelir, ayrı
  // kırpılır — açık kapsam, iki açık gruptan biri tavandaysa alt sınırdır.
  const openCount = useMemo(() => all.filter((r) => r.status === "OPEN" && !r.masked).length, [all]);
  const maskedCount = useMemo(() => all.filter((r) => r.masked).length, [all]);
  const pastCount = all.filter((r) => r.status !== "OPEN").length;
  const openGroupAtCap = openCount >= OPEN_SCAN_CAP || maskedCount >= OPEN_SCAN_CAP;
  const facets = useMemo(
    () =>
      requestFacets(
        all,
        state,
        segmentNames,
        now,
        {
          country: (c) => countryDisplayName(c, locale),
          unknownBuyer: tv("bilinmeyenAlici"),
        },
        // Toplam 300'ü geçse de hiçbir grup tavanda değilse sayı kesindir.
        { open: openGroupAtCap ? 0 : Number.POSITIVE_INFINITY, past: PAST_SCAN_CAP },
      ),
    [all, key, segmentNames, now, locale, openGroupAtCap], // eslint-disable-line react-hooks/exhaustive-deps
  );
  // Önce teklif verilebilir satırlar, sonra maskeli grup — sıralama grup İÇİNDE.
  const filtered = useMemo(() => {
    const hits = all.filter((r) => passes(r, state, now));
    return [
      ...sortRequests(hits.filter((r) => !r.masked), state.sort),
      ...sortRequests(hits.filter((r) => r.masked), state.sort),
    ];
  }, [all, key, now]); // eslint-disable-line react-hooks/exhaustive-deps
  const openAtCap = state.status !== "gecmis" && openGroupAtCap;
  const pastAtCap = state.status !== "aktif" && pastCount >= PAST_SCAN_CAP;
  // Süzgeç daraltmadıysa sayı tavandaki kümenin TAMAMI → alt sınır ("200+");
  // durum facet'iyle aynı karar (iki sayı aynı ekranda ayrışmasın).
  const countAtLeast = facets.statusAtLeast[state.status];

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
        isFree={isFree}
        atCap={openAtCap}
        pastAtCap={pastAtCap}
        countAtLeast={countAtLeast}
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
  isFree,
  atCap,
  pastAtCap,
  countAtLeast,
  isLoading,
  isError,
  refetch,
}: {
  state: RequestFilterState;
  rows: SellerTenderRow[];
  facets: RequestFacets;
  banner?: ReactNode;
  /** Ücretsiz (STANDART) üye — alt başlık ve maskeli grup metni. */
  isFree: boolean;
  /** Açık talepler tarama tavanında (yalnız açık kapsamı görünürken). */
  atCap: boolean;
  /** Geçmiş talepler tavanında (yalnız geçmiş kapsamı görünürken). */
  pastAtCap: boolean;
  /** Sayaç tavandaki kümenin tamamı → "N+". */
  countAtLeast: boolean;
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
          {isFree ? tr("dogrulanmamisAltBaslik") : tr("bagliOldugunuzAlicilarinVeHerkese")}
        </p>
      </div>

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {tr("enFazla300GosteriliyorDaha", { unit: t.unit })}
        </div>
      ) : null}
      {pastAtCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {tr("gecmisEnYeni200Gosteriliyor")}
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
              {/* Durum süzgecine göre metin (D-116): geçmişte "açık talep"
                  demek çelişkiydi. */}
              <ResultCount
                kind={state.status === "gecmis" ? "pastRequest" : state.status === "tumu" ? "request" : "openRequest"}
                atLeast={countAtLeast}
              />
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
                  /* Ücretsiz üyede herkese açık talepler de (alıcı adı gizli)
                     listede — boş arama artık paketin değil süzgecin sonucu
                     (eski "kilitli sonuç yok" dalı 2026-10-03'te kalktı). */
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
                {/* `role="table"` KALDIRILDI (yayın denetimi 2026-09-28 Bölüm 12 —
                    IhaleListView'deki 2026-09-12 düzeltmesinin eşi): satırlar kart,
                    ARIA tablosu `row` çocuk ister → axe KRİTİK ihlal. */}
                <section className="space-y-2" aria-label={tr("listesi", { noun: t.searchNoun })}>
                  {pageRows.map((row, i) => (
                    <Fragment key={row.id}>
                      {/* Maskeli grubun başı (bu sayfada) — ince bölüm etiketi
                          + tek satır doğrulama/paket notu; kilit kartı yok. */}
                      {row.masked && !pageRows[i - 1]?.masked ? (
                        <MaskedSectionLabel />
                      ) : null}
                      <BrowseTenderRow t={row} />
                    </Fragment>
                  ))}
                </section>
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
