import { affixCurrency, bidDeliveryTimeLabel } from "@rothern/shared";
import { DEFAULT_LOCALE, isLocale, type Locale } from "@rothern/i18n";
import { formatDate } from "@/lib/format-date";
import { intlLocale } from "@/i18n/format";
import { lineAmount, MONEY_FRACTION } from "@/lib/line-amount";

import { escapeHtml } from "@/lib/escape-html";

/** Kalem teslim etiketi (kalem süresi > kalem tarihi > sipariş geneli > "—").
 *  Süre = 2026-08-02 sonrası teklifler; tarih legacy kayıtlar için kalır.
 *  `generalSuffix` = sipariş GENELİNDEN gelen tarihin notu (katalog:
 *  `web.panel.trade.siparisIdPage.print.genel`) — saf fonksiyon, hook çağırmaz. */
export function itemDeliveryLabel(
  itemDate: string | null | undefined,
  orderDate: string | null,
  itemTime: string | null | undefined,
  generalSuffix: string,
  /** Süre etiketi okuyucunun dilinde (`useBidDeliveryTimeLabel`); verilmezse Türkçe. */
  deliveryTimeLabel: (code: string | null | undefined) => string | null = bidDeliveryTimeLabel,
  /** Tarih dili — okuyucunun dili (date-fns `tr` sabitti → İngilizce çıktıda "12 Eki"). */
  locale: Locale = DEFAULT_LOCALE,
): string {
  const timeLabel = deliveryTimeLabel(itemTime);
  if (timeLabel) return timeLabel;
  if (itemDate) return formatDate(itemDate, "short", locale);
  if (orderDate)
    return `${formatDate(orderDate, "short", locale)} ${generalSuffix}`;
  return "—";
}

interface OrderPrintItem {
  name: string;
  unit: string;
  quantity: number | string;
  unitPrice: number | string;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
  requestedBrand?: string | null;
  requestedMpn?: string | null;
  isAlternative?: boolean;
  offeredBrand?: string | null;
  offeredMpn?: string | null;
}

const joinParts = (...parts: (string | null | undefined)[]) =>
  parts
    .map((p) => p?.trim())
    .filter(Boolean)
    .join(" · ");

/**
 * Kalemin marka / muadil satırı (arayüz testi O-003): muadilde "Muadil —
 * Teklif edilen: FAG · 6204-2Z-C3 (İstenen: SKF · 6204-2RS)", değilse istenen
 * marka · parça no; ikisi de yoksa null. Uyuşmazlıkta bağlayıcı belge.
 */
export function itemBrandLine(
  it: Pick<
    OrderPrintItem,
    "requestedBrand" | "requestedMpn" | "isAlternative" | "offeredBrand" | "offeredMpn"
  >,
  labels: Pick<OrderPrintLabels, "alternative" | "offered" | "requested" | "notSpecified">,
): string | null {
  const requested = joinParts(it.requestedBrand, it.requestedMpn);
  if (it.isAlternative) {
    const offered = joinParts(it.offeredBrand, it.offeredMpn) || labels.notSpecified;
    return `${labels.alternative} — ${labels.offered}: ${offered}${
      requested ? ` (${labels.requested}: ${requested})` : ""
    }`;
  }
  return requested || null;
}

interface OrderPrintOrder {
  number?: string | null;
  createdAt: string;
  counterparty: string;
  listingTitle?: string | null;
  listingNumber?: string | null;
  amount: number | string;
  expectedDeliveryDate: string | null;
  items?: OrderPrintItem[] | null;
}

/**
 * Yazdırma çıktısının etiketleri — OKUYUCUNUN DİLİNDE (i18n Faz 2). Saf
 * fonksiyon hook çağıramaz → çağıran sayfa `t`siyle doldurur
 * (`web.panel.trade.siparisIdPage.print.*`).
 */
export interface OrderPrintLabels {
  order: string;
  buyer: string;
  seller: string;
  request: string;
  status: string;
  item: string;
  quantity: string;
  delivery: string;
  unit: string;
  amount: string;
  noItems: string;
  total: string;
  /** Sipariş genelinden gelen teslim tarihinin notu — "(genel)". */
  general: string;
  /** Muadil satırı: "Muadil", "Teklif edilen", "İstenen", "belirtilmedi". */
  alternative: string;
  offered: string;
  requested: string;
  notSpecified: string;
}

/**
 * Sipariş yazdır/PDF HTML'ini üretir — SAF fonksiyon (test edilebilir; asıl
 * çağrı `window.open` + `document.write`, RTL'de test edilemezdi).
 *
 * GÜVENLİK: karşı-taraf kontrollü TÜM string alanları (`it.name`, `it.unit`,
 * `counterparty`, `listingTitle`, `listingNumber`, `number`) `escapeHtml`'den
 * geçer → HTML string'ine `<img onerror=…>`/`</td><script>…` enjekte edilemez.
 * Sayısal alanlar `Number(...).toLocaleString` ile üretildiğinden zaten güvenli.
 */
export function buildOrderPrintHtml(
  o: OrderPrintOrder,
  ctx: {
    isSeller: boolean;
    /** Siparişin para birimi KODU — sembol ve yeri dilden (`affixCurrency`). */
    currency: string;
    statusLabel: string;
    labels: OrderPrintLabels;
    /** Sayfa dili (`lang` + sayı biçimi) — çıktı okuyucunun dilinde. */
    locale: string;
    /** Teslim süresi etiketi okuyucunun dilinde (`useBidDeliveryTimeLabel`). */
    deliveryTimeLabel?: (code: string | null | undefined) => string | null;
    /** Miktar + birim okuyucunun dilinde, çoğul kuralıyla (`useQuantityLabel`); verilmezse sayı + kayıtlı ad. */
    quantityLabel?: (qty: number, unit: string) => string;
  },
): string {
  const { isSeller, currency, statusLabel, labels, locale, deliveryTimeLabel, quantityLabel } = ctx;
  // Para HER ZAMAN 2 ondalık (ekrandaki `formatMoney` ile aynı kural): seçeneksiz
  // toLocaleString 0-3 ondalık basıyordu ("12,5 ₺", "1.000 ₺").
  const moneyFmt = new Intl.NumberFormat(intlLocale(locale), MONEY_FRACTION);
  const money = (n: number) => affixCurrency(moneyFmt.format(n), currency, locale);
  const dateLocale: Locale = isLocale(locale) ? locale : DEFAULT_LOCALE;
  const rows = (o.items ?? [])
    .map((it) => {
      const line = lineAmount(Number(it.quantity), Number(it.unitPrice));
      const dd = itemDeliveryLabel(
        it.deliveryDate,
        o.expectedDeliveryDate,
        it.deliveryTime,
        labels.general,
        deliveryTimeLabel,
        dateLocale,
      );
      const brand = itemBrandLine(it, labels);
      const nameCell = brand
        ? `${escapeHtml(it.name)}<div class="muted" style="font-size:12px">${escapeHtml(brand)}</div>`
        : escapeHtml(it.name);
      return `<tr><td>${nameCell}</td><td style="text-align:right">${escapeHtml(quantityLabel ? quantityLabel(Number(it.quantity), it.unit) : `${Number(it.quantity).toLocaleString(locale)} ${it.unit}`)}</td><td style="text-align:right">${escapeHtml(dd)}</td><td style="text-align:right">${escapeHtml(money(Number(it.unitPrice)))}</td><td style="text-align:right">${escapeHtml(money(line))}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="${escapeHtml(locale)}"><head><meta charset="utf-8"><title>${escapeHtml(o.number ?? labels.order)}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#18181b;padding:32px;max-width:720px;margin:auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#71717a;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{padding:8px;border-bottom:1px solid #e4e4e7}th{text-align:left;color:#71717a;font-size:11px;text-transform:uppercase}
.tot{text-align:right;font-size:16px;font-weight:700;margin-top:12px}
.meta{margin-top:8px;font-size:13px;line-height:1.7}</style></head>
<body>
<h1>${escapeHtml(labels.order)} ${escapeHtml(o.number ?? "")}</h1>
<div class="muted">Rothern · ${escapeHtml(formatDate(o.createdAt, "datetime", dateLocale))}</div>
<div class="meta">
<strong>${escapeHtml(isSeller ? labels.buyer : labels.seller)}:</strong> ${escapeHtml(o.counterparty)}<br>
<strong>${escapeHtml(labels.request)}:</strong> ${escapeHtml(o.listingTitle ?? "—")} (${escapeHtml(o.listingNumber ?? "—")})<br>
<strong>${escapeHtml(labels.status)}:</strong> ${escapeHtml(statusLabel)}
</div>
<table><thead><tr><th>${escapeHtml(labels.item)}</th><th style="text-align:right">${escapeHtml(labels.quantity)}</th><th style="text-align:right">${escapeHtml(labels.delivery)}</th><th style="text-align:right">${escapeHtml(labels.unit)}</th><th style="text-align:right">${escapeHtml(labels.amount)}</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#a1a1aa">${escapeHtml(labels.noItems)}</td></tr>`}</tbody></table>
<div class="tot">${escapeHtml(labels.total)}: ${escapeHtml(money(Number(o.amount)))}</div>
</body></html>`;
}
