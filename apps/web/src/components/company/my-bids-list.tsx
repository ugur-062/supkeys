"use client";

import { useTranslations } from "next-intl";
import { useNavLabel } from "@/i18n/domain";
import { MODULE_LABELS } from "@/lib/company/portals";
import { selectActiveOffers, selectWonOffers } from "@/lib/company/kpi-selectors";
import { formatDate } from "@/lib/format-date";
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
import { useMyBids, type MyBid } from "@/hooks/use-company-listings";
import { closingUrgency } from "@/lib/tenders/seller-state";
import { formatMoney } from "@/components/ui/money";
import { bidDeliveryTimeLabel } from "@rothern/shared";
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
import { useMemo, useState } from "react";

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

const SORT_OPTIONS = [
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

function matchesSearch(b: MyBid, q: string) {
  if (!q) return true;
  const needle = q.toLocaleLowerCase("tr");
  return (
    b.listing.title.toLocaleLowerCase("tr").includes(needle) ||
    (b.listing.number ?? "").toLocaleLowerCase("tr").includes(needle) ||
    b.listing.ownerName.toLocaleLowerCase("tr").includes(needle)
  );
}

/** Teklif kartı — Açık Talepler kart dilinin teklif sürümü. */
function MyBidCard({ b, fromHref }: { b: MyBid; fromHref: string }) {
  const t = useTranslations("web.panel.trade.myBidsList");
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
              {t("alici")}
              {b.listing.ownerName}
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
          {b.version > 1 ? (
            <span
              className="text-xs text-zinc-500"
              title={t("buTeklifinRevizyonu", { version: b.version })}
            >
              {t("revizyon", { version: b.version })}
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

/** Firmanın açık taleplere verdiği teklifler (satış paneli). */
export function MyBidsList() {
const t = useTranslations("web.panel.trade.myBidsList");
const tn = useNavLabel();
  const accent = useButtonAccent();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<string[]>([]);
  const [sort, setSort] = useState("newest");
  const [range, setRange] = useState("all");
  const [page, setPage] = useState(1);

  const { data, isLoading } = useMyBids();

  const description = t("acikTaleplereVerdiginizTumTeklifler");
  const emptyHint =
    t("acikTaleplerEkranindanBirTalebe");
  const fromHref = "/company/satis/tekliflerim";

  const all = useMemo(() => data ?? [], [data]);

  const filtered = useMemo(() => {
    const rangeMs = range === "all" ? null : Number(range) * 86_400_000;
    const now = Date.now();
    const rows = all.filter((b) => {
      if (!matchesSearch(b, search)) return false;
      if (status.length > 0 && !status.includes(b.status)) return false;
      if (rangeMs !== null && now - new Date(b.createdAt).getTime() > rangeMs)
        return false;
      return true;
    });
    const out = [...rows];
    if (sort === "oldest") {
      out.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
    } else if (sort === "amount") {
      // Çoklu birimde adil kıyas: TRY karşılığı varsa onunla, yoksa ham tutar.
      const val = (x: MyBid) => Number(x.amountTry ?? x.amount);
      out.sort((a, b) => val(b) - val(a));
    } else {
      out.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    }
    return out;
  }, [all, search, status, sort, range]);

  const isFiltered = search !== "" || status.length > 0 || range !== "all";
  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageRows = filtered.slice(
    (safePage - 1) * PAGE_SIZE,
    safePage * PAGE_SIZE,
  );

  const optionLabel = (o: { labelKey: string } | undefined, fallback: string) =>
    o ? t(o.labelKey as never) : fallback;

  function resetToFirstPage<T>(setter: (v: T) => void) {
    return (v: T) => {
      setPage(1);
      setter(v);
    };
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title={tn(MODULE_LABELS.satis.teklifler)}
        description={description}
      />
      {/* Sayaçlar panodaki KPI ile AYNI seçiciden (kpi-selectors) — iki sayfa
          iki farklı sayı gösteriyordu. */}
      {all.length > 0 ? (
        <p className="text-sm text-zinc-500" aria-label={t("teklifOzeti")}>
          {t.rich("ozet", {
            active: selectActiveOffers(all).length,
            won: selectWonOffers(all).length,
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
            onChange={resetToFirstPage(setSearch)}
            placeholder={t("talepAdiNumarasiVeyaAlici")}
            className="flex-1"
          />
          <FilterSelect
            icon={ArrowUpDown}
            value={sort}
            onChange={resetToFirstPage(setSort)}
            options={SORT_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("siralama")}
            active={sort !== "newest"}
            className="sm:min-w-[160px]"
          />
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <FilterMultiSelect
            icon={ListFilter}
            value={status}
            onChange={resetToFirstPage(setStatus)}
            options={STATUS_FILTER_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            allLabel={t("tumDurumlar")}
            ariaLabel={t("durumaGoreFiltrele")}
          />
          <FilterSelect
            icon={CalendarRange}
            value={range}
            onChange={resetToFirstPage(setRange)}
            options={RANGE_OPTIONS.map((o) => ({ value: o.value, label: t(o.labelKey as never) }))}
            ariaLabel={t("tarihAraligi")}
            active={range !== "all"}
          />
          <ResultCount
            total={filtered.length}
            isFiltered={isFiltered}
            kind="teklif"
            className="ml-auto"
          />
        </div>
        <ActiveFilterChips
          filters={[
            ...(search
              ? [
                  {
                    key: "search",
                    label: t("arama", { search: search }),
                    onRemove: () => resetToFirstPage(setSearch)(""),
                  },
                ]
              : []),
            ...status.map((s) => ({
              key: `status:${s}`,
              label: optionLabel(STATUS_FILTER_OPTIONS.find((f) => f.value === s), s),
              onRemove: () => resetToFirstPage(setStatus)(status.filter((x) => x !== s)),
            })),
            ...(range !== "all"
              ? [
                  {
                    key: "range",
                    label: optionLabel(RANGE_OPTIONS.find((r) => r.value === range), range),
                    onRemove: () => resetToFirstPage(setRange)("all"),
                  },
                ]
              : []),
          ]}
          onClearAll={() => {
            setSearch("");
            setStatus([]);
            setRange("all");
            setPage(1);
          }}
        />
      </div>

      {isLoading ? (
        <ListSkeleton rows={5} />
      ) : filtered.length === 0 ? (
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
                onClick={() => {
                  setSearch("");
                  setStatus([]);
                  setRange("all");
                  setPage(1);
                }}
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
            {pageRows.map((b) => (
              <MyBidCard key={b.id} b={b} fromHref={fromHref} />
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
