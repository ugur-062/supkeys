"use client";

import { useTranslations } from "next-intl";
import { useBidDeliveryTimeLabel, useFormatDate, useNavLabel } from "@/i18n/domain";
import { MODULE_LABELS } from "@/lib/company/portals";
import {
  ActiveFilterChips,
  FilterMultiSelect,
  EmptyState,
  FilterSelect,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { CountdownFull } from "@/components/tenders/countdown-full";
import { useMyBids, type MyBid, type MyBidSort } from "@/hooks/use-company-listings";
import { useDebouncedValue } from "@/hooks/use-debounced-value";
import { ErrorState } from "@/components/ui/error-state";
import { closingUrgency } from "@/lib/tenders/seller-state";
import { useFormatMoney } from "@/components/ui/money";
import { cn } from "@/lib/utils";
import {
  ArrowUpDown,
  Building2,
  Calendar,
  CalendarRange,
  CircleSlash,
  Clock,
  Gavel,
  ListFilter,
} from "lucide-react";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { accentFillClass, useButtonAccent } from "@/components/ui/button-accent";
import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";

const PAGE_SIZE = 10;

// Etiketler katalog anahtarı (`status.<KOD>`), çizim yerinde `t(key)`.
const STATUS: Record<
  string,
  { key: string; color: "amber" | "green" | "zinc" | "red" | "violet" }
> = {
  DRAFT: { key: "status.DRAFT", color: "amber" },
  SUBMITTED: { key: "status.SUBMITTED", color: "violet" },
  WON: { key: "status.WON", color: "green" },
  AWARDED_PARTIAL: { key: "status.AWARDED_PARTIAL", color: "green" },
  LOST: { key: "status.LOST", color: "zinc" },
  // Nötr kullanıcı eylemi — kırmızı hata/tehlike imasıydı (detay paneliyle uyum).
  WITHDRAWN: { key: "status.WITHDRAWN", color: "zinc" },
};
/** C52: statü → sol şerit rengi (rozet renkleriyle aynı aile). */
const STATUS_STRIP: Record<string, string> = {
  DRAFT: "bg-gradient-to-b from-amber-500 to-amber-300",
  SUBMITTED: "bg-gradient-to-b from-violet-500 to-violet-300",
  WON: "bg-gradient-to-b from-emerald-500 to-emerald-300",
  AWARDED_PARTIAL: "bg-gradient-to-b from-emerald-500 to-emerald-300",
  LOST: "bg-gradient-to-b from-zinc-400 to-zinc-300",
  WITHDRAWN: "bg-gradient-to-b from-zinc-400 to-zinc-300",
};
// Bilinmeyen statü listeyi ÇÖKERTMESİN (eskiden DRAFT'ta beyaz ekran).
const STATUS_FALLBACK = { key: "status.UNKNOWN", color: "zinc" as const };

// Çoklu seçim (2026-09-10): "Tümü" satırını FilterMultiSelect kendisi ekler.
// `labelKey` katalog anahtarı — seçenek listeleri bileşende `t(labelKey)` ile çizilir.
const STATUS_FILTER_OPTIONS = [
  { value: "DRAFT", labelKey: "status.DRAFT" },
  { value: "SUBMITTED", labelKey: "status.SUBMITTED" },
  { value: "WON", labelKey: "status.WON" },
  { value: "AWARDED_PARTIAL", labelKey: "status.AWARDED_PARTIAL" },
  { value: "LOST", labelKey: "status.LOST" },
  { value: "WITHDRAWN", labelKey: "status.WITHDRAWN" },
];

const SORT_OPTIONS: { value: MyBidSort; labelKey: string }[] = [
  { value: "newest", labelKey: "sort.newest" },
  { value: "oldest", labelKey: "sort.oldest" },
  { value: "amount", labelKey: "sort.amount" },
];

const RANGE_OPTIONS = [
  { value: "all", labelKey: "range.all" },
  { value: "7", labelKey: "range.d7" },
  { value: "30", labelKey: "range.d30" },
  { value: "90", labelKey: "range.d90" },
  { value: "365", labelKey: "range.d365" },
];

/** Teklif kartı — Açık Talepler kart dilinin teklif sürümü. */
function MyBidCard({ b, fromHref }: { b: MyBid; fromHref: string }) {
  const t = useTranslations("web.panel.trade.myBidsList");
  const bidDeliveryTimeLabel = useBidDeliveryTimeLabel();
  const formatDate = useFormatDate();
  const { money: formatMoney } = useFormatMoney();
  const st = STATUS[b.status] ?? STATUS_FALLBACK;
  const won = b.status === "WON" || b.status === "AWARDED_PARTIAL";
  const canRebid = b.status === "LOST" && b.listing.status === "OPEN";
  const urgency =
    b.listing.status === "OPEN"
      ? closingUrgency(b.listing.status, b.listing.closesAt)
      : null;

  // P2 (denetim §10.2): kart <a> DEĞİL — başlıktaki stretched-link kartı
  // tıklanabilir kılar; iç aksiyonlar relative z-10 gerçek link olur
  // (button+router.push workaround'u biter).
  // TEKLİF KARTI v2 (2026-09-19, kullanıcı mockup'ı): kalın statü şeridi,
  // numara pili | "Açık Talep" mavi çip, büyük başlık, ikon karolu "Alıcı"
  // satırı · dikey ayraç · mavi tutar pili · taahhüt; alt satır ayraçlı —
  // solda takvim "Verildi", sağda gri geri sayım pili (saat ikonu).
  return (
    <div
      className={cn(
        "group relative flex h-full flex-col overflow-hidden rounded-2xl bg-white p-5 pl-7 shadow-sm ring-1 ring-zinc-950/5 transition-all duration-200 hover:-translate-y-[1px] hover:shadow-card-hover hover:ring-blue-300",
      )}
    >
        {/* C52: sol şerit STATÜ rengi (tek harita) — önceden ihale TİPİ
            rengiydi ve "Kazandı" ile "Değerlendirmede" aynı renkte görünüyordu. */}
        <span
          aria-hidden
          className={cn(
            "absolute left-0 top-0 bottom-0 w-1.5 rounded-l-2xl",
            STATUS_STRIP[b.status] ?? "bg-gradient-to-b from-zinc-400 to-zinc-300",
          )}
        />
        <div className="flex items-start justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span className="rounded-lg bg-zinc-100 px-2.5 py-1 text-sm font-medium tabular-nums text-zinc-600">
              {b.listing.number ?? "—"}
            </span>
            <span aria-hidden className="h-5 w-px bg-zinc-200" />
            <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-sm font-medium text-blue-600">{t("acikTalep")}</span>
          </div>
          <span
            className={cn(
              "shrink-0 rounded-full px-3.5 py-1.5 text-sm font-medium",
              st.color === "violet" && "bg-violet-100 text-violet-700",
              st.color === "green" && "bg-emerald-100 text-emerald-700",
              st.color === "amber" && "bg-amber-100 text-amber-800",
              st.color === "red" && "bg-red-100 text-red-700",
              st.color === "zinc" && "bg-zinc-100 text-zinc-600",
            )}
          >
            {t(st.key as never)}
          </span>
        </div>
        <h3
          className={cn(
            "mt-2.5 line-clamp-2 text-xl leading-snug font-bold text-zinc-950 transition-colors",
            "group-hover:text-blue-700",
          )}
        >
          <Link
            href={`/company/ilan/${b.listing.id}?from=${encodeURIComponent(fromHref)}&fromLabel=${encodeURIComponent(MODULE_LABELS.satis.teklifler)}`}
            className="after:absolute after:inset-0 after:content-['']"
          >
            {b.listing.title}
          </Link>
        </h3>

        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <span className="inline-flex min-w-0 items-center gap-2.5 text-zinc-600">
            <span className="flex size-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
              <Building2 className="size-4 text-zinc-600" aria-hidden="true" />
            </span>
            <span className="truncate">
              {t("alici", { name: b.listing.ownerName })}
            </span>
          </span>
          <span aria-hidden className="hidden h-7 w-px bg-zinc-200 sm:block" />
          <span className="inline-flex items-center rounded-xl bg-blue-50 px-3.5 py-1.5 text-base font-bold tabular-nums text-blue-700">
            {formatMoney(b.amount, b.currency)}
          </span>
          {b.currency !== "TRY" && b.amountTry ? (
            <span className="text-xs tabular-nums text-zinc-500">
              ≈ {formatMoney(b.amountTry, "TRY")}
            </span>
          ) : null}
          {b.deliveryTime || b.deliveryDate ? (
            <span className="text-zinc-600">
              {t("taahhutTeslim", {
                value:
                  bidDeliveryTimeLabel(b.deliveryTime) ??
                  (b.deliveryDate ? formatDate(b.deliveryDate, "short") : ""),
              })}
            </span>
          ) : null}
          {/* §8.4: Tur/revizyon renkli rozet değil, renksiz meta. */}
          {b.round > 1 ? (
            <span className="text-xs text-zinc-500">{t("tur", { round: b.round })}</span>
          ) : null}
          {/* Revizyon = GÖNDERİM sayısı (O-036): `version` eşzamanlılık
              sayacıdır, taslak kaydında da artar. */}
          {b.submitCount > 1 ? (
            <span
              className="text-xs text-zinc-500"
              title={t("buTeklifinRevizyonu", { version: b.submitCount })}
            >
              {t("revizyon", { version: b.submitCount })}
            </span>
          ) : null}
        </div>

        {canRebid ? (
          <p className="mt-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-1.5 text-xs text-amber-800">
            {t("talepHalaAcikGuncellenmisTeklifle")}
          </p>
        ) : null}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-3 text-sm">
          <div className="flex items-center gap-2 text-zinc-600">
            <Calendar className="size-4" aria-hidden="true" />
            <span>{t("verildi", { date: formatDate(b.createdAt, "short") })}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {b.listing.status === "OPEN" && b.listing.closesAt ? (
              <span
                className={cn(
                  "inline-flex items-center gap-2 rounded-full bg-zinc-100 px-3.5 py-1.5 font-medium whitespace-nowrap text-zinc-700",
                  urgency?.className,
                )}
              >
                <Clock className="size-4" aria-hidden="true" />
                {t("kapanisa")}{" "}
                <CountdownFull
                  deadline={b.listing.closesAt}
                  endedLabel={t("kapandi")}
                />
              </span>
            ) : !won ? (
              <span className="text-zinc-500">
                {/* C51: Değerlendirmede rozetiyle "kapandı" çelişkili okunuyordu —
                    gönderilmiş teklifte süreç dili. */}
                {b.status === "SUBMITTED" ? t("sonucBekleniyor") : t("talepKapandi")}
              </span>
            ) : null}
            {/* P2 (denetim §10.2): duruma göre TEK kart aksiyonu. */}
            {won && b.orderId ? (
              <Link
                href={`/company/siparis/${b.orderId}`}
                className="relative z-10 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50"
              >
                {t("sipariseGit")}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            ) : canRebid ? (
              <Link
                href={`/company/ilan/${b.listing.id}/teklif-ver`}
                className="relative z-10 inline-flex items-center gap-1 rounded-lg px-3 py-1.5 font-semibold text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50"
              >
                {t("yenidenTeklifVer")}
                <ArrowRightIcon className="size-4" aria-hidden />
              </Link>
            ) : null}
          </div>
        </div>
    </div>
  );
}

/**
 * `?status=` değerinden başlangıç süzgeci; bilinmeyen kodlar atılır. URL'deki
 * küme OLDUĞU GİBİ geri yüklenir (arayüz testi D-120): eskiden `WON` her zaman
 * `AWARDED_PARTIAL` ile genişletiliyordu, yalnız "Kazandı" seçip teklife girip
 * dönen kullanıcı "Kazandı + Kısmen Kazandı" görüyordu. "Kısmi kazanım dahil"
 * KPI'ları bunun yerine `MY_BIDS_WON_KPI_HREF` (lib/company/my-bids-links) ile iki kodu açıkça taşır.
 */
export function parseStatusParam(raw: string | null): MyBid["status"][] {
  const picked = (raw ?? "")
    .split(",")
    .filter((v): v is MyBid["status"] => STATUS_FILTER_OPTIONS.some((o) => o.value === v));
  return [...new Set(picked)];
}

/**
 * Tekliflerim süzgeç durumu — URL'de yaşar (arayüz testi D-120): teklife girip
 * geri dönünce ya da adresi paylaşınca süzgeç/sıralama/sayfa korunur; Şirketim
 * KPI'ları (`?status=WON,AWARDED_PARTIAL`, `?pending=1`) buraya doğrudan bağlanır.
 */
export interface MyBidsUrlState {
  status: MyBid["status"][];
  /** Karar bekleyen (sunucunun `counts.active` kümesi). */
  pending: boolean;
  q: string;
  sort: MyBidSort;
  range: string;
  page: number;
}

export function parseMyBidsUrl(sp: URLSearchParams): MyBidsUrlState {
  const sort = sp.get("sort");
  const range = sp.get("range");
  const page = Number(sp.get("page"));
  return {
    status: parseStatusParam(sp.get("status")),
    pending: sp.get("pending") === "1",
    q: (sp.get("q") ?? "").slice(0, 120),
    sort: SORT_OPTIONS.some((o) => o.value === sort) ? (sort as MyBidSort) : "newest",
    range: RANGE_OPTIONS.some((o) => o.value === range) ? (range as string) : "all",
    page: Number.isInteger(page) && page > 1 ? page : 1,
  };
}

export function buildMyBidsQuery(s: MyBidsUrlState): string {
  const sp = new URLSearchParams();
  if (s.status.length) sp.set("status", s.status.join(","));
  if (s.pending) sp.set("pending", "1");
  if (s.q) sp.set("q", s.q);
  if (s.sort !== "newest") sp.set("sort", s.sort);
  if (s.range !== "all") sp.set("range", s.range);
  if (s.page > 1) sp.set("page", String(s.page));
  const qs = sp.toString();
  return qs ? `?${qs}` : "";
}

const BASE_HREF = "/company/satis/tekliflerim";

/** Firmanın açık taleplere verdiği teklifler (satış paneli). */
export function MyBidsList() {
  const t = useTranslations("web.panel.trade.myBidsList");
  const tn = useNavLabel();
  const accent = useButtonAccent();
  // KPI drill-down (Şirketim / İş Analizi): `?status=WON,AWARDED_PARTIAL`
  // (MY_BIDS_WON_KPI_HREF) ya da `?pending=1` — süzgeç, sıralama ve sayfa URL'de.
  const sp = useSearchParams();
  const [state, setState] = useState<MyBidsUrlState>(() =>
    parseMyBidsUrl(new URLSearchParams(sp?.toString() ?? "")),
  );
  const [search, setSearch] = useState(state.q);
  const debouncedSearch = useDebouncedValue(search.trim(), 300);

  // Süzme/sıralama/sayfalama SUNUCUDA (arayüz testi O-005): eskiden uç en yeni
  // 200 teklifi döndürüyor, istemci o kesik listede süzüp sayıyordu.
  const { data, isLoading, isError, refetch } = useMyBids({
    status: state.status,
    pending: state.pending,
    q: state.q || undefined,
    days: state.range === "all" ? undefined : Number(state.range),
    sort: state.sort,
    page: state.page,
    pageSize: PAGE_SIZE,
  });

  /** Durumu güncelle + adres çubuğuna yaz (geçmiş girdisi açmadan). */
  const update = (patch: Partial<MyBidsUrlState>, resetPage = true) => {
    const next = { ...state, ...patch, ...(resetPage ? { page: 1 } : {}) };
    setState(next);
    try {
      const u = new URL(window.location.href);
      u.search = buildMyBidsQuery(next);
      window.history.replaceState(window.history.state, "", u.toString());
    } catch {
      /* adres yazılamadı — durum yine güncellenir */
    }
  };

  useEffect(() => {
    if (debouncedSearch !== state.q) update({ q: debouncedSearch });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debouncedSearch]);

  const description = t("acikTaleplereVerdiginizTumTeklifler");
  const emptyHint = t("acikTaleplerEkranindanBirTalebe");
  // Detaydan "geri" süzgeçli listeye dönsün.
  const fromHref = `${BASE_HREF}${buildMyBidsQuery(state)}`;

  const rows = data?.items ?? [];
  const total = data?.total ?? 0;
  const counts = data?.counts;
  const isFiltered =
    state.q !== "" || state.status.length > 0 || state.pending || state.range !== "all";
  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const safePage = Math.min(data?.page ?? state.page, totalPages);

  const optionLabel = (o: { labelKey: string } | undefined, fallback: string) =>
    o ? t(o.labelKey as never) : fallback;

  const clearAll = () => {
    setSearch("");
    update({ q: "", status: [], pending: false, range: "all" });
  };

  return (
    <div className="space-y-6">
      <PageHeader
        title={tn(MODULE_LABELS.satis.teklifler)}
        description={description}
      />
      {/* Sayaçlar SUNUCUDAN (süzgeçten bağımsız) — Şirketim KPI'ları ile aynı
          sayım; eskiden en yeni 200 teklifte sayılıyordu. */}
      {counts && counts.all > 0 ? (
        <p className="text-sm text-zinc-500" aria-label={t("teklifOzeti")}>
          {t.rich("ozet", {
            active: counts.active,
            won: counts.won,
            b: (c) => <span className="font-semibold text-zinc-900">{c}</span>,
          })}
        </p>
      ) : null}

      {/* Arama + filtreler — diğer listelerle aynı düzen: üstte tam-genişlik
          arama + sıralama, altta ikonlu filtre pill'leri + sonuç sayacı. */}
      <div className="space-y-3">
        <div className="flex flex-col gap-2 sm:flex-row sm:items-center">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder={t("talepAdiNumarasiVeyaAlici")}
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={state.sort}
            onChange={(v) => update({ sort: v as MyBidSort })}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("siralama")}
            active={state.sort !== "newest"}
            className="sm:min-w-[160px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            icon={ListFilter}
            value={state.status}
            onChange={(v) => update({ status: v as MyBid["status"][] })}
            options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            allLabel={t("tumDurumlar")}
            ariaLabel={t("durumaGoreFiltrele")}
          />
          <FilterSelect
            icon={CalendarRange}
            value={state.range}
            onChange={(v) => update({ range: v })}
            options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("tarihAraligi")}
            active={state.range !== "all"}
          />
          <ResultCount
            total={total}
            isFiltered={isFiltered}
            kind="teklif"
            isLoading={isLoading}
            className="ml-auto"
          />
        </div>
        <ActiveFilterChips
          filters={[
            ...(state.q
              ? [
                  {
                    key: "search",
                    label: t("arama", { search: state.q }),
                    onRemove: () => {
                      setSearch("");
                      update({ q: "" });
                    },
                  },
                ]
              : []),
            ...(state.pending
              ? [
                  {
                    key: "pending",
                    label: t("kararBekleyen"),
                    onRemove: () => update({ pending: false }),
                  },
                ]
              : []),
            ...state.status.map((s) => ({
              key: `status:${s}`,
              label: optionLabel(STATUS_FILTER_OPTIONS.find((f) => f.value === s), s),
              onRemove: () => update({ status: state.status.filter((x) => x !== s) }),
            })),
            ...(state.range !== "all"
              ? [
                  {
                    key: "range",
                    label: optionLabel(RANGE_OPTIONS.find((r) => r.value === state.range), state.range),
                    onRemove: () => update({ range: "all" }),
                  },
                ]
              : []),
          ]}
          onClearAll={clearAll}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : isError && !data ? (
        <ErrorState onRetry={() => void refetch()} />
      ) : rows.length === 0 ? (
        <EmptyState
          icon={isFiltered ? CircleSlash : Gavel}
          variant={isFiltered ? "no-results" : "no-data"}
          title={isFiltered ? t("eslesenTeklifYok") : t("henuzTeklifVermediniz")}
          description={
            isFiltered ? t("filtreleriDegistiripTekrarDene") : emptyHint
          }
          action={
            isFiltered ? (
              /* P2 (denetim §5): filtre yüzünden boşsa TEK TIK temizleme. */
              <button
                type="button"
                onClick={clearAll}
                className="inline-flex items-center rounded-lg border border-zinc-300 px-4 py-2.5 text-sm font-semibold text-zinc-700 transition hover:bg-zinc-50"
              >
                {t("filtreleriTemizle")}
              </button>
            ) : (
              <Link
                href="/company/satis#acik-talepler"
                className={cn(
                  "inline-flex items-center rounded-lg px-4 py-2.5 text-sm font-semibold text-white transition",
                  accentFillClass(accent),
                )}
              >
                {t("acikTaleplereGozAt")}
              </Link>
            )
          }
        />
      ) : (
        <>
          <div className="flex flex-col gap-3">
            {rows.map((b) => (
              <MyBidCard key={b.id} b={b} fromHref={fromHref} />
            ))}
          </div>
          {totalPages > 1 ? (
            <Pagination
              variant="bare"
              page={safePage}
              totalPages={totalPages}
              total={total}
              pageSize={PAGE_SIZE}
              onPageChange={(p) => update({ page: p }, false)}
            />
          ) : null}
        </>
      )}
    </div>
  );
}
