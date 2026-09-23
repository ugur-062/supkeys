import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { bidDeliveryTimeLabel } from "@rothern/shared";

import { escapeHtml } from "@/lib/escape-html";

/** Kalem teslim etiketi (kalem süresi > kalem tarihi > sipariş geneli > "—").
 *  Süre = 2026-08-02 sonrası teklifler; tarih legacy kayıtlar için kalır. */
export function itemDeliveryLabel(
  itemDate: string | null | undefined,
  orderDate: string | null,
  itemTime?: string | null,
): string {
  const timeLabel = bidDeliveryTimeLabel(itemTime);
  if (timeLabel) return timeLabel;
  if (itemDate) return format(new Date(itemDate), "dd MMM yyyy", { locale: tr });
  if (orderDate)
    return `${format(new Date(orderDate), "dd MMM yyyy", { locale: tr })} (genel)`;
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
  ctx: { isSeller: boolean; curSym: string; statusLabel: string },
): string {
  const { isSeller, curSym, statusLabel } = ctx;
  const rows = (o.items ?? [])
    .map((it) => {
      const line = Number(it.quantity) * Number(it.unitPrice);
      const dd = itemDeliveryLabel(
        it.deliveryDate,
        o.expectedDeliveryDate,
        it.deliveryTime,
      );
      return `<tr><td>${escapeHtml(it.name)}</td><td style="text-align:right">${Number(it.quantity).toLocaleString("tr-TR")} ${escapeHtml(it.unit)}</td><td style="text-align:right">${escapeHtml(dd)}</td><td style="text-align:right">${Number(it.unitPrice).toLocaleString("tr-TR")} ${escapeHtml(curSym)}</td><td style="text-align:right">${line.toLocaleString("tr-TR")} ${escapeHtml(curSym)}</td></tr>`;
    })
    .join("");
  return `<!doctype html><html lang="tr"><head><meta charset="utf-8"><title>${escapeHtml(o.number ?? "Sipariş")}</title>
<style>body{font-family:system-ui,Arial,sans-serif;color:#18181b;padding:32px;max-width:720px;margin:auto}
h1{font-size:20px;margin:0 0 4px}.muted{color:#71717a;font-size:13px}
table{width:100%;border-collapse:collapse;margin-top:16px;font-size:13px}
th,td{padding:8px;border-bottom:1px solid #e4e4e7}th{text-align:left;color:#71717a;font-size:11px;text-transform:uppercase}
.tot{text-align:right;font-size:16px;font-weight:700;margin-top:12px}
.meta{margin-top:8px;font-size:13px;line-height:1.7}</style></head>
<body>
<h1>Sipariş ${escapeHtml(o.number ?? "")}</h1>
<div class="muted">Rothern · ${escapeHtml(new Date(o.createdAt).toLocaleString("tr-TR"))}</div>
<div class="meta">
<strong>${isSeller ? "Alıcı" : "Satıcı"}:</strong> ${escapeHtml(o.counterparty)}<br>
<strong>Satın Alma Talebi:</strong> ${escapeHtml(o.listingTitle ?? "—")} (${escapeHtml(o.listingNumber ?? "—")})<br>
<strong>Durum:</strong> ${escapeHtml(statusLabel)}
</div>
<table><thead><tr><th>Kalem</th><th style="text-align:right">Miktar</th><th style="text-align:right">Teslim</th><th style="text-align:right">Birim</th><th style="text-align:right">Tutar</th></tr></thead>
<tbody>${rows || '<tr><td colspan="5" style="text-align:center;color:#a1a1aa">Kalem yok</td></tr>'}</tbody></table>
<div class="tot">Toplam: ${Number(o.amount).toLocaleString("tr-TR")} ${escapeHtml(curSym)}</div>
</body></html>`;
}
