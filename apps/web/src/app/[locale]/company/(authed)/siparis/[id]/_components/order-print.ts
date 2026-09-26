import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { bidDeliveryTimeLabel } from "@rothern/shared";

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
): string {
  const timeLabel = bidDeliveryTimeLabel(itemTime);
  if (timeLabel) return timeLabel;
  if (itemDate) return format(new Date(itemDate), "dd MMM yyyy", { locale: tr });
  if (orderDate)
    return `${format(new Date(orderDate), "dd MMM yyyy", { locale: tr })} ${generalSuffix}`;
  return "—";
}

interface OrderPrintItem {
  name: string;
  unit: string;
  quantity: number | string;
  unitPrice: number | string;
  deliveryDate?: string | null;
  deliveryTime?: string | null;
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
    curSym: string;
    statusLabel: string;
    labels: OrderPrintLabels;
    /** Sayfa dili (`lang` + sayı biçimi) — çıktı okuyucunun dilinde. */
    locale: string;
  },
): string {
  const { isSeller, curSym, statusLabel, labels, locale } = ctx;
  const rows = (o.items ?? [])
    .map((it) => {
      const line = Number(it.quantity) * Number(it.unitPrice);
      const dd = itemDeliveryLabel(
        it.deliveryDate,
        o.expectedDeliveryDate,
        it.deliveryTime,
        labels.general,
      );
      return `<tr><td>${escapeHtml(it.name)}</td><td style="text-align:right">${Number(it.quantity).toLocaleString(locale)} ${escapeHtml(it.unit)}</td><td style="text-align:right">${escapeHtml(dd)}</td><td style="text-align:right">${Number(it.unitPrice).toLocaleString(locale)} ${escapeHtml(curSym)}</td><td style="text-align:right">${line.toLocaleString(locale)} ${escapeHtml(curSym)}</td></tr>`;
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
<div class="muted">Rothern · ${escapeHtml(new Date(o.createdAt).toLocaleString(locale))}</div>
<div class="meta">
<strong>${escapeHtml(isSeller ? labels.buyer : labels.seller)}:</strong> ${escapeHtml(o.counterparty)}<br>
<strong>${escapeHtml(labels.request)}:</strong> ${escapeHtml(o.listingTitle ?? "—")} (${escapeHtml(o.listingNumber ?? "—")})<br>
<strong>${escapeHtml(labels.status)}:</strong> ${escapeHtml(statusLabel)}
</div>
<table><thead><tr><th>${escapeHtml(labels.item)}</th><th style="text-align:right">${escapeHtml(labels.quantity)}</th><th style="text-align:right">${escapeHtml(labels.delivery)}</th><th style="text-align:right">${escapeHtml(labels.unit)}</th><th style="text-align:right">${escapeHtml(labels.amount)}</th></tr></thead>
<tbody>${rows || `<tr><td colspan="5" style="text-align:center;color:#a1a1aa">${escapeHtml(labels.noItems)}</td></tr>`}</tbody></table>
<div class="tot">${escapeHtml(labels.total)}: ${Number(o.amount).toLocaleString(locale)} ${escapeHtml(curSym)}</div>
</body></html>`;
}
