"use client";

import { foldSearchText } from "@rothern/shared";
import { useTranslations } from "next-intl";
import { useListingStatusLabel, useListingTerms, useNavLabel } from "@/i18n/domain";
import { MODULE_LABELS, PORTAL_SECONDARY_HREFS } from "@/lib/company/portals";
import {
  ActiveFilterChips,
  FilterMultiSelect,
  FilterSelect,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { IhaleListView } from "@/components/ihale/IhaleListView";
import { TALEPLERIM_HREF } from "@/components/ihale/IhaleListRow";
import { Button } from "@/components/ui/button";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useReadFailed } from "@/hooks/use-read-failed";
import {
  useTenders,
  type TenderListItem,
} from "@/hooks/use-company-tenders";
import { ArrowUpDown, BarChart3, Building2, CalendarRange, Globe, LayoutTemplate, User as UserIcon } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import {
  matchesTenderAiPending,
  matchesTenderClosing,
  matchesTenderHasBids,
  parseTenderClosing,
  type TenderClosingFilter,
} from "@/lib/dashboard/derived-filters";

// Etiketler katalog anahtarı (`web.panel.requests.ihalelerView.sort.*` /
// `.range.*`); çizim yerinde `tr(key)` ile çevrilir.
const SORT_OPTIONS = [
  { value: "createdAt:desc", key: "sort.newest" },
  { value: "createdAt:asc", key: "sort.oldest" },
  { value: "bidsCloseAt:asc", key: "sort.closingSoon" },
  { value: "bidsCloseAt:desc", key: "sort.closingLate" },
] as const;
const DEFAULT_SORT = "createdAt:desc";

const DATE_FIELDS = new Set<keyof TenderListItem>([
  "createdAt",
  "bidsCloseAt",
  "publishedAt",
]);

/**
 * Liste sıralaması (saf; test edilir). "Yakın Biten" (`bidsCloseAt:asc`):
 * kapanışı GELECEKTE olanlar önce ve artan; kapanışı geçmiş olanlar sonra
 * (en son kapanan önce) — derin denetim LU-31: düz artan sıra aylar önce
 * kapanmış talepleri yarın kapanacakların önüne koyuyordu.
 */
export function sortTenderRows(
  rows: TenderListItem[],
  sort: string,
  now: number,
): TenderListItem[] {
  const [field, dir] = sort.split(":") as [keyof TenderListItem, string];
  const closingSoon = field === "bidsCloseAt" && dir === "asc";
  return [...rows].sort((a, b) => {
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
      if (closingSoon) {
        const aPast = at < now;
        const bPast = bt < now;
        if (aPast !== bPast) return aPast ? 1 : -1;
        if (aPast) return bt - at;
      }
      return dir === "asc" ? at - bt : bt - at;
    }
    const av = String(ra);
    const bv = String(rb);
    return dir === "asc" ? av.localeCompare(bv) : bv.localeCompare(av);
  });
}

type RangeKey = "7d" | "30d" | "3m" | "6m" | "12m" | "all";
const RANGE_OPTIONS: { value: RangeKey; key: string }[] = [
  { value: "7d", key: "range.d7" },
  { value: "30d", key: "range.d30" },
  { value: "3m", key: "range.m3" },
  { value: "6m", key: "range.m6" },
  { value: "12m", key: "range.m12" },
  { value: "all", key: "range.all" },
];
// C4: varsayılan "Tümü" — "Son 3 Ay" sessizce eski talepleri gizliyordu ve
// isFiltered mantığını ters çeviriyordu (Tümü seçince "filtrelenmiş" yazıyordu).
const DEFAULT_RANGE: RangeKey = "all";
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
// IN_AWARD = "Değerlendirmede" — kapanan talep doğrudan bu duruma geçer
// (ayrı "Teklife Kapalı" ara durumu 2026-07-13'te kaldırıldı).
// Çoklu seçim (2026-09-10): "Tümü" satırını FilterMultiSelect kendisi ekler.
// Etiket katalogdan (`useListingStatusLabel`), burada yalnız sıra + değer.
const STATUS_VALUES: Exclude<TabKey, "all">[] = [
  "DRAFT",
  "IN_APPROVAL",
  "OPEN",
  "IN_AWARD",
  "IN_AWARD_APPROVAL",
  "AWARDED",
  "CLOSED_NO_AWARD",
  "CANCELLED",
];

const PAGE_SIZE = 20;

type ScopeKey = "all" | "open" | "limited";
const SCOPE_VALUES: ScopeKey[] = ["all", "open", "limited"];

/**
 * Liste durumu ADRES ÇUBUĞUNDA (arayüz testi O-052): süzgeç seçip talebe
 * girince Geri tuşu bütün listeye dönüyordu. Siparişler listesiyle aynı ilke
 * (`orders-list.tsx` `parseOrdersUrl`): yalnız listenin kendi anahtarları
 * okunur/yazılır, diğer parametreler korunur, varsayılanlar yazılmaz.
 * `status` aynı zamanda KPI drill-down girişidir (`?status=OPEN`, virgüllü çoklu).
 * `closing=nobids|soon`, `bids=1` ve `ai=1` Şirketim satır/KPI kümeleridir (O-035;
 * tanım `derived-filters.ts`); menüde seçeneği yok, çipten kaldırılır.
 */
export interface TendersUrlState {
  q: string;
  status: string[];
  closing?: TenderClosingFilter | null;
  bids?: boolean;
  ai?: boolean;
  sort: string;
  range: RangeKey;
  scope: ScopeKey;
  by: string;
  page: number;
}

export function parseTendersUrl(get: (key: string) => string | null): TendersUrlState {
  const sort = get("sort") ?? "";
  const range = get("range") ?? "";
  const scope = get("scope") ?? "";
  const page = Number.parseInt(get("page") ?? "", 10);
  return {
    q: get("q") ?? "",
    status: (get("status") ?? "")
      .split(",")
      .filter((v) => (STATUS_VALUES as string[]).includes(v)),
    closing: parseTenderClosing(get("closing")),
    bids: get("bids") === "1",
    ai: get("ai") === "1",
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? sort : DEFAULT_SORT,
    range: RANGE_OPTIONS.some((o) => o.value === range) ? (range as RangeKey) : DEFAULT_RANGE,
    scope: (SCOPE_VALUES as string[]).includes(scope) ? (scope as ScopeKey) : "all",
    by: get("by") ?? "",
    page: Number.isFinite(page) && page > 1 ? page : 1,
  };
}

export function writeTendersUrl(params: URLSearchParams, st: TendersUrlState): URLSearchParams {
  const out = new URLSearchParams(params);
  const set = (key: string, value: string | null) => {
    if (value) out.set(key, value);
    else out.delete(key);
  };
  set("q", st.q || null);
  set("status", st.status.length > 0 ? st.status.join(",") : null);
  set("closing", st.closing ?? null);
  set("bids", st.bids ? "1" : null);
  set("ai", st.ai ? "1" : null);
  set("sort", st.sort !== DEFAULT_SORT ? st.sort : null);
  set("range", st.range !== DEFAULT_RANGE ? st.range : null);
  set("scope", st.scope !== "all" ? st.scope : null);
  set("by", st.by || null);
  set("page", st.page > 1 ? String(st.page) : null);
  return out;
}

/**
 * Satır → detay `from=` adresi: liste yolu + listenin KENDİ anahtarları
 * (varsayılanlar yazılmaz). Detaydaki "← Taleplerim" bağlantısı da tarayıcı
 * Geri tuşu gibi kalınan süzgeç/arama/sayfaya döner (O-052 yeniden doğrulama).
 */
export function tendersListHref(st: TendersUrlState): string {
  const qs = writeTendersUrl(new URLSearchParams(), st).toString();
  return qs ? `${TALEPLERIM_HREF}?${qs}` : TALEPLERIM_HREF;
}

export function IhalelerView() {
  const tr = useTranslations("web.panel.requests.ihalelerView");
  const tn = useNavLabel();
  const statusLabel = useListingStatusLabel();
  // Sayaç/arama metinleri kayıt tipi sözlüğünden (tek kaynak).
  const t = useListingTerms("ALIM");
  const secondary = PORTAL_SECONDARY_HREFS.satinalma;
  // Raporlar hub'ında bu sayfanın işi satınalma raporlarıdır: izin yoksa hub
  // "Size açık rapor yok" der — giriş noktası hiç çizilmez. İzin var, paket
  // Gold altıysa hub kilitli Gold kartını gösterir (paket kilidi orada; arayüz
  // testi son tur webC-2 NEW-1).
  const canSeeBuyReports = useHasCompanyPermission("buy:reports:view");
  const list = useTenders();
  const all = useMemo(() => list.data ?? [], [list.data]);
  // LİSTE DURUMLARI (canlı doğrulama 2026-10-09, OUTR-2 / OUTR-5): sayı ve "yok"
  // yalnız OKUNMUŞ listeden türer. Yanıt yokken (yükleme, çevrimdışı duraklama
  // ya da kesinti) "Tüm Durumlar (0)" ve "0 satın alma talebi" basılmaz —
  // 500'den fazla talebi olan hesapta kesinti sıfır gibi okunuyordu. Arka plan
  // yoklaması (15 sn) düşerse eldeki satırlar ve sayılar ekranda KALIR: hata
  // dalı yalnız hiç veri yokken (`isError` ∧ `data === undefined`). Hata kartı
  // yoklamayla iskelete DÖNMEZ (`useReadFailed`, OUTF-1): veri gelene dek durur.
  const unread = list.data === undefined;
  const { failed, retry } = useReadFailed(list);

  // Başlangıç durumu ADRESTEN (O-052) — Faz 4.2 KPI drill-down `?status=OPEN`
  // (virgüllü çoklu) dahil. `useSearchParams` sunucu-öncesi render ve testte
  // NULL dönebilir.
  const sp = useSearchParams();
  const [initial] = useState(() => parseTendersUrl((k) => sp?.get(k) ?? null));
  const [statuses, setStatuses] = useState<string[]>(initial.status);
  const [closing, setClosing] = useState<TenderClosingFilter | null>(initial.closing ?? null);
  const [hasBids, setHasBids] = useState(initial.bids ?? false);
  const [aiPending, setAiPending] = useState(initial.ai ?? false);
  const [search, setSearch] = useState(initial.q);
  const [sort, setSort] = useState<string>(initial.sort);
  const [range, setRange] = useState<RangeKey>(initial.range);
  const [createdById, setCreatedById] = useState(initial.by);
  // Görünürlük süzgeci (2026-09-21): kapsam yerine "tüm ülkelere açık / belirli ülkeler".
  const [scope, setScope] = useState<ScopeKey>(initial.scope);
  const [page, setPage] = useState(initial.page);

  // Durum değişince adres çubuğuna yaz — geçmiş girdisi AÇMADAN (replaceState):
  // detaydan Geri bu adrese, yani kalınan süzgeç ve sayfaya döner.
  useEffect(() => {
    try {
      const u = new URL(window.location.href);
      const next = writeTendersUrl(u.searchParams, {
        q: search,
        status: statuses,
        closing,
        bids: hasBids,
        ai: aiPending,
        sort,
        range,
        scope,
        by: createdById,
        page,
      }).toString();
      if (next === u.searchParams.toString()) return;
      u.search = next ? `?${next}` : "";
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* adres yazılamadı — liste yine çalışır */
    }
  }, [search, statuses, closing, hasBids, aiPending, sort, range, scope, createdById, page]);

  // Durum sayaçları — durum DIŞINDAKİ aktif filtrelerle tutarlı (facet):
  // "Tümü (N)" etiketi görünen listeyle aynı evreni saysın.
  const facetRows = useMemo(() => {
    const days = RANGE_DAYS[range];
    const minDate = days ? Date.now() - days * 86_400_000 : null;
    const q = foldSearchText(search);
    const now = Date.now();
    return all.filter((t) => {
      if (!matchesTenderClosing(t, closing, now)) return false;
      if (!matchesTenderHasBids(t, hasBids)) return false;
      if (!matchesTenderAiPending(t, aiPending)) return false;
      if (createdById && t.createdById !== createdById) return false;
      if (scope !== "all" && ((t.targetCountries ?? []).length === 0) !== (scope === "open"))
        return false;
      if (minDate && new Date(t.createdAt).getTime() < minDate) return false;
      if (
        q &&
        !foldSearchText(t.title).includes(q) &&
        !foldSearchText(t.tenderNumber).includes(q)
      )
        return false;
      return true;
    });
  }, [all, closing, hasBids, aiPending, createdById, scope, range, search]);
  const stats = useMemo(() => {
    const c: Record<string, number> = {};
    for (const t of facetRows) c[t.status] = (c[t.status] ?? 0) + 1;
    return c;
  }, [facetRows]);

  // Açan kişiler (satın almacılar)
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
    const q = foldSearchText(search);
    const now = Date.now();
    const rows = all.filter((t) => {
      if (statuses.length > 0 && !statuses.includes(t.status)) return false;
      if (!matchesTenderClosing(t, closing, now)) return false;
      if (!matchesTenderHasBids(t, hasBids)) return false;
      if (!matchesTenderAiPending(t, aiPending)) return false;
      if (createdById && t.createdById !== createdById) return false;
      if (scope !== "all" && ((t.targetCountries ?? []).length === 0) !== (scope === "open"))
        return false;
      if (minDate && new Date(t.createdAt).getTime() < minDate) return false;
      if (
        q &&
        !foldSearchText(t.title).includes(q) &&
        !foldSearchText(t.tenderNumber).includes(q)
      )
        return false;
      return true;
    });
    return sortTenderRows(rows, sort, Date.now());
  }, [all, statuses, closing, hasBids, aiPending, createdById, scope, range, search, sort]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );
  const isFiltered =
    Boolean(search) ||
    statuses.length > 0 ||
    closing !== null ||
    hasBids ||
    aiPending ||
    range !== DEFAULT_RANGE ||
    scope !== "all" ||
    Boolean(createdById);
  // Backend en fazla 500 kayıt döndürür (listTenders take).
  const atCap = all.length >= 500;

  const reset = <T,>(setter: (v: T) => void) => (v: T) => {
    setPage(1);
    setter(v);
  };
  // O-086: süzgeç yüzünden boş listede tek tık temizleme (sıralama korunur).
  const clearFilters = () => {
    setSearch("");
    setStatuses([]);
    setClosing(null);
    setHasBids(false);
    setAiPending(false);
    setRange(DEFAULT_RANGE);
    setScope("all");
    setCreatedById("");
    setPage(1);
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tn(MODULE_LABELS.satinalma.ihalelerim)}
        description={tr("tedarikSurecleriniziYonetinAcinDavet")}
        action={
          <div className="flex flex-wrap items-center gap-2">
            {/* Sol menü sadeleştirmesi (2026-08-22): Şablonlar + Raporlar
                menüden kalktı — tek giriş noktası bu sayfanın başlığı. Sayfalar
                kendi paket kapılarını uygular; izni olmayana Raporlar çizilmez. */}
            {/* D-247: bağlantı içinde düğme (`<a><button>`) değil, tek bağlantı. */}
            <Button variant="secondary" href={secondary.sablonlar}>
              <LayoutTemplate className="h-4 w-4" />
              {tr("sablonlar")}
            </Button>
            {canSeeBuyReports ? (
              <Button variant="secondary" href={secondary.raporlar}>
                <BarChart3 className="h-4 w-4" />
                {tr("raporlar")}
              </Button>
            ) : null}
            {/* Başlıkta "Yeni …" CTA'sı YOK (v2 3b): aynı eylem sol menüdeki
                renkli düğmede — sayfa başına tek primary. Liste boşken boş
                durum kendi CTA'sını gösterir (IhaleListView, F7 rol kapısıyla). */}
          </div>
        }
      />

      {atCap ? (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5 text-xs text-amber-800">
          {tr("enFazla500GosteriliyorDaha", { unit: t.unit })}
        </div>
      ) : null}

      {/* Arama + filtreler */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={reset(setSearch)}
            placeholder={tr("adiVeyaNumarasiAra")}
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={reset(setSort)}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: tr(o.key) }))}
            ariaLabel={tr("siralama")}
            active={sort !== DEFAULT_SORT}
            className="sm:min-w-[150px]"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            icon={Building2}
            value={statuses}
            onChange={reset(setStatuses)}
            // C43: sayaç HER seçenekte — "(0)" yazmayan seçenek tıklanıp boş
            // sonuç veriyordu, sayı bilgisi tutarsızdı.
            // Okunmuş listede o durumda satır yoksa sayı gerçekten 0'dır;
            // liste okunmadıysa sayaç hiç yazılmaz.
            options={STATUS_VALUES.map((v) => ({
              value: v,
              label: unread ? statusLabel(v) : `${statusLabel(v)} (${stats[v] ?? 0})`,
            }))}
            allLabel={unread ? tr("tumDurumlarSayisiz") : tr("tumDurumlar", { length: facetRows.length })}
            ariaLabel={tr("durumFiltresi")}
          />
          <FilterSelect
            icon={Globe}
            value={scope}
            onChange={(v) => reset(setScope)(v as ScopeKey)}
            options={[
              { value: "all", label: tr("tumGorunurlukler") },
              { value: "open", label: tr("tumUlkelereAcik") },
              { value: "limited", label: tr("belirliUlkeler") },
            ]}
            ariaLabel={tr("gorunurlukFiltresi")}
            active={scope !== "all"}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={(v) => reset(setRange)(v as RangeKey)}
            options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: tr(o.key as never) }))}
            ariaLabel={tr("tarihAraligi")}
            active={range !== DEFAULT_RANGE}
          />
          <FilterSelect
            icon={UserIcon}
            value={createdById}
            onChange={reset(setCreatedById)}
            options={[
              {
                value: "",
                label: tr("tumSorumlular"),
              },
              ...buyers.map((b) => ({
                value: b.id,
                label: `${b.firstName} ${b.lastName} (${b.count})`,
              })),
            ]}
            ariaLabel={tr("sorumluFiltresi")}
            active={!!createdById}
          />
          {failed ? (
            // Okunamayan toplam "0 satın alma talebi" diye basılmaz (Siparişlerim
            // D-259 ve Tekliflerim OUT-2 ile aynı kural) — hata kartı aşağıda.
            <span className="ml-auto" />
          ) : (
            <ResultCount
              total={filtered.length}
              isFiltered={isFiltered}
              kind="satinAlmaTalebi"
              isLoading={list.isPending}
              className="ml-auto"
            />
          )}
        </div>
        {/* Şirketim satır/KPI kümeleri (O-035): menüde seçeneği olmayan
            türetilmiş süzgeçler görünür ve tek tıkla kaldırılabilir. */}
        <ActiveFilterChips
          filters={[
            ...(closing
              ? [
                  {
                    key: "closing",
                    label: tr(closing === "nobids" ? "closingFilter.nobids" : "closingFilter.soon"),
                    onRemove: () => reset(setClosing)(null),
                  },
                ]
              : []),
            ...(hasBids
              ? [
                  {
                    key: "bids",
                    label: tr("bidsFilter"),
                    onRemove: () => reset(setHasBids)(false),
                  },
                ]
              : []),
            ...(aiPending
              ? [
                  {
                    key: "ai",
                    label: tr("aiFilter"),
                    onRemove: () => reset(setAiPending)(false),
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            setClosing(null);
            setHasBids(false);
            setAiPending(false);
            setPage(1);
          }}
        />
      </div>

      {/* Tek görünüm: yoğun satır listesi (kart görünümü + görünüm anahtarı
          kullanıcı isteğiyle kaldırıldı, 2026-08-03). */}
      <IhaleListView
        items={pageRows}
        isLoading={list.isPending}
        isError={failed}
        onRetry={retry}
        emptyCtaLabel={tr("satinAlmaTalebiAc")}
        /* Hiç talep yokken (KPI/aksiyon merkezinden `?status=OPEN` ile
           gelen yeni firma) boşluğun sebebi süzgeç değil: "henüz yok +
           oluştur" CTA'sı gösterilir (O-086 gözden geçirme). */
        isFiltered={isFiltered && all.length > 0}
        onClearFilters={clearFilters}
        fromHref={tendersListHref({
          q: search,
          status: statuses,
          closing,
          bids: hasBids,
        ai: aiPending,
          sort,
          range,
          scope,
          by: createdById,
          page,
        })}
      />

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
