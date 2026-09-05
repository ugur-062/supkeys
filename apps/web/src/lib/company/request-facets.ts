import type { SellerTenderRow } from "@/hooks/use-seller-tenders";
import {
  CLOSING_WINDOWS,
  PERIOD_WINDOWS,
  segmentOf,
  type ClosingWindow,
  type PeriodWindow,
  type RequestFilterState,
  type RequestFit,
  type RequestSort,
} from "./request-filter-params";

/**
 * AÇIK TALEP SÜZGEÇ MOTORU — istemci tarafı (2026-09-05).
 *
 * `seller-tenders` listeyi bütün olarak verir (tavan 300, görünürlük tek
 * kaynak `sellerVisibleWhere`); süzme, sıralama ve facet sayımı burada,
 * saf fonksiyonlarla. Sayaçlar BAĞLAMSAL: her boyut, KENDİSİ hariç seçili
 * süzgeçlerle sayılır (ürün dizinindeki `contextualFacetCounts` ile aynı
 * kural) — "0" görünen seçenek soluk, seçili olan her zaman listede.
 */
const DAY = 86_400_000;

export type RequestDim =
  | "q"
  | "status"
  | "fit"
  | "categories"
  | "scope"
  | "closing"
  | "buyers"
  | "cities"
  | "currencies"
  | "format"
  | "period";

export function rowFits(row: SellerTenderRow, fit: RequestFit): boolean {
  switch (fit) {
    case "davet":
      return row.invited;
    case "baglanti":
      return row.connected;
    case "urun":
      return row.productMatch === true;
    case "kategori":
      return row.categoryMatch;
    case "teklif":
      return row.myBidStatus != null;
  }
}

/** Satırın segmentleri (tekil) — kategori sayacı satırı segment başına bir kez sayar. */
export function rowSegments(row: SellerTenderRow): string[] {
  return [...new Set(row.categories.map((c) => segmentOf(c.code)))];
}

/** Arama samanlığı: başlık · numara · alıcı · KALEM adları · kategori adları. */
export function searchHaystack(row: SellerTenderRow): string {
  return [
    row.title,
    row.number ?? "",
    row.owner?.name ?? "",
    ...(row.itemNames ?? []),
    ...row.categories.map((c) => c.name),
  ]
    .join(" ")
    .toLocaleLowerCase("tr-TR");
}

function textHit(row: SellerTenderRow, q: string): boolean {
  return searchHaystack(row).includes(q.toLocaleLowerCase("tr-TR"));
}

/** Arama kalem adında geçtiyse o kalem (öneri satırı "Kalem: …" der). */
export function matchedItemName(row: SellerTenderRow, q: string): string | null {
  const needle = q.trim().toLocaleLowerCase("tr-TR");
  if (!needle) return null;
  return (row.itemNames ?? []).find((n) => n.toLocaleLowerCase("tr-TR").includes(needle)) ?? null;
}

export function closesWithin(row: SellerTenderRow, days: number, now: number): boolean {
  if (row.status !== "OPEN" || !row.closesAt) return false;
  const t = new Date(row.closesAt).getTime();
  return t >= now && t - now <= days * DAY;
}

const publishedWithin = (row: SellerTenderRow, days: number, now: number) =>
  now - new Date(row.createdAt).getTime() <= days * DAY;

/** Satır süzgeçten geçer mi — `except` verilen boyut ATLANIR (facet sayımı). */
export function passes(
  row: SellerTenderRow,
  f: RequestFilterState,
  now: number,
  except?: RequestDim,
): boolean {
  if (except !== "q" && f.q && !textHit(row, f.q)) return false;
  if (except !== "status") {
    if (f.status === "aktif" && row.status !== "OPEN") return false;
    if (f.status === "gecmis" && row.status === "OPEN") return false;
  }
  if (except !== "fit" && f.fit.length && !f.fit.some((x) => rowFits(row, x))) return false;
  if (except !== "categories" && f.categories.length) {
    const segs = rowSegments(row);
    if (!f.categories.some((c) => segs.includes(c))) return false;
  }
  if (except !== "scope" && f.scope && (f.scope === "uluslararasi") !== row.isInternational)
    return false;
  if (except !== "closing" && f.closing && !closesWithin(row, f.closing, now)) return false;
  if (except !== "buyers" && f.buyers.length && !(row.owner && f.buyers.includes(row.owner.id)))
    return false;
  if (except !== "cities" && f.cities.length && !(row.ownerCity && f.cities.includes(row.ownerCity)))
    return false;
  if (except !== "currencies" && f.currencies.length && !f.currencies.includes(row.currency))
    return false;
  if (except !== "format" && f.format) {
    const auction = row.format === "ENGLISH_AUCTION";
    if ((f.format === "pazarlik") !== auction) return false;
  }
  if (except !== "period" && f.period && !publishedWithin(row, f.period, now)) return false;
  return true;
}

/**
 * Sıralama: kullanıcı seçiminin ÜSTÜNDE ilgi merdiveni (davetli › bağlantılı
 * › ÜRÜN eşleşen › kategori eşleşen › ilgi kademesi; API ile AYNI sıra) —
 * "beni özel çağıran" talep, sırf kapanışı uzak diye aşağı düşmez. Kademe
 * içinde seçim geçerli.
 */
export function sortRequests(rows: SellerTenderRow[], sort?: RequestSort): SellerTenderRow[] {
  const time = (iso: string | null) => (iso ? new Date(iso).getTime() : null);
  const tier = (n?: number) => (!n ? 0 : n >= 15 ? 2 : n >= 5 ? 1 : 0);
  return [...rows].sort((a, b) => {
    if (a.invited !== b.invited) return a.invited ? -1 : 1;
    if (a.connected !== b.connected) return a.connected ? -1 : 1;
    const pa = a.productMatch === true;
    const pb = b.productMatch === true;
    if (pa !== pb) return pa ? -1 : 1;
    if (a.categoryMatch !== b.categoryMatch) return a.categoryMatch ? -1 : 1;
    const dt = tier(b.matchScore) - tier(a.matchScore);
    if (dt !== 0) return dt;
    if (!sort) {
      const d = (b.matchScore ?? 0) - (a.matchScore ?? 0);
      if (d !== 0) return d;
    }
    if (sort === "yeni")
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    // Kapanışı olmayanlar yönden bağımsız SONA (desc'te başa sıçramasın).
    const ta = time(a.closesAt);
    const tb = time(b.closesAt);
    if (ta === null && tb === null) return 0;
    if (ta === null) return 1;
    if (tb === null) return -1;
    return sort === "uzak" ? tb - ta : ta - tb;
  });
}

export interface FacetItem {
  key: string;
  label: string;
  count: number;
}
export interface RequestFacets {
  status: Record<"aktif" | "gecmis" | "tumu", number>;
  fit: Record<RequestFit, number>;
  categories: FacetItem[];
  scope: Record<"yurtici" | "uluslararasi", number>;
  closing: Record<ClosingWindow, number>;
  buyers: FacetItem[];
  cities: FacetItem[];
  currencies: FacetItem[];
  format: Record<"teklif" | "pazarlik", number>;
  period: Record<PeriodWindow, number>;
}

function tally(
  rows: SellerTenderRow[],
  keysOf: (r: SellerTenderRow) => { key: string; label: string }[],
  selected: string[],
  labelOf: (key: string) => string,
): FacetItem[] {
  const m = new Map<string, FacetItem>();
  for (const r of rows) {
    for (const { key, label } of keysOf(r)) {
      const e = m.get(key) ?? { key, label, count: 0 };
      e.count += 1;
      m.set(key, e);
    }
  }
  // Seçili değer sonuçsuz kalsa da listede durur (kaldırılabilsin diye).
  for (const s of selected) if (!m.has(s)) m.set(s, { key: s, label: labelOf(s), count: 0 });
  return [...m.values()].sort(
    (a, b) => b.count - a.count || a.label.localeCompare(b.label, "tr"),
  );
}

export function requestFacets(
  all: SellerTenderRow[],
  f: RequestFilterState,
  segmentNames: ReadonlyMap<string, string>,
  now: number,
): RequestFacets {
  const rowsFor = (dim: RequestDim) => all.filter((r) => passes(r, f, now, dim));
  const count = (rows: SellerTenderRow[], pred: (r: SellerTenderRow) => boolean) =>
    rows.reduce((n, r) => n + (pred(r) ? 1 : 0), 0);

  const st = rowsFor("status");
  const fit = rowsFor("fit");
  const sc = rowsFor("scope");
  const cl = rowsFor("closing");
  const fm = rowsFor("format");
  const pd = rowsFor("period");
  const buyerName = (id: string) => all.find((r) => r.owner?.id === id)?.owner?.name ?? "Alıcı";

  return {
    status: {
      aktif: count(st, (r) => r.status === "OPEN"),
      gecmis: count(st, (r) => r.status !== "OPEN"),
      tumu: st.length,
    },
    fit: {
      davet: count(fit, (r) => rowFits(r, "davet")),
      baglanti: count(fit, (r) => rowFits(r, "baglanti")),
      urun: count(fit, (r) => rowFits(r, "urun")),
      kategori: count(fit, (r) => rowFits(r, "kategori")),
      teklif: count(fit, (r) => rowFits(r, "teklif")),
    },
    categories: tally(
      rowsFor("categories"),
      (r) => rowSegments(r).map((key) => ({ key, label: segmentNames.get(key) ?? key })),
      f.categories,
      (k) => segmentNames.get(k) ?? k,
    ),
    scope: {
      yurtici: count(sc, (r) => !r.isInternational),
      uluslararasi: count(sc, (r) => r.isInternational),
    },
    closing: Object.fromEntries(
      CLOSING_WINDOWS.map((d) => [d, count(cl, (r) => closesWithin(r, d, now))]),
    ) as Record<ClosingWindow, number>,
    buyers: tally(
      rowsFor("buyers"),
      (r) => (r.owner ? [{ key: r.owner.id, label: r.owner.name }] : []),
      f.buyers,
      buyerName,
    ),
    cities: tally(
      rowsFor("cities"),
      (r) => (r.ownerCity ? [{ key: r.ownerCity, label: r.ownerCity }] : []),
      f.cities,
      (k) => k,
    ),
    currencies: tally(
      rowsFor("currencies"),
      (r) => [{ key: r.currency, label: r.currency }],
      f.currencies,
      (k) => k,
    ),
    format: {
      teklif: count(fm, (r) => r.format !== "ENGLISH_AUCTION"),
      pazarlik: count(fm, (r) => r.format === "ENGLISH_AUCTION"),
    },
    period: Object.fromEntries(
      PERIOD_WINDOWS.map((d) => [d, count(pd, (r) => publishedWithin(r, d, now))]),
    ) as Record<PeriodWindow, number>,
  };
}
