import { format } from "date-fns";
import { tr } from "date-fns/locale";

export interface OrderPdfData {
  orderNumber: string;
  orderDate: Date;

  // İhale referansı
  tenderNumber: string;
  tenderTitle: string;

  // Alıcı
  buyerCompanyName: string;
  buyerTaxOffice?: string | null;
  buyerTaxNumber?: string | null;
  buyerAddress: string;
  buyerEmail?: string | null;
  buyerPhone?: string | null;

  // Tedarikçi
  supplierCompanyName: string;
  supplierTaxOffice?: string | null;
  supplierTaxNumber?: string | null;
  supplierAddress?: string | null;
  supplierEmail?: string | null;
  supplierPhone?: string | null;

  // Teslimat adresi (text, snapshot'tan formatlanmış)
  deliveryAddress: string;

  // Kalemler
  items: Array<{
    name: string;
    description?: string | null;
    quantity: number;
    unit: string;
    unitPrice: number;
    totalPrice: number;
  }>;

  // Tutarlar
  subtotal: number;
  vatRate: number; // V1.5: 20 (sabit)
  vatAmount: number;
  total: number;
  currency: string;

  // Status
  statusLabel: string;

  // Notlar
  bidNotes?: string | null;
  deliveryNote?: string | null;
  expectedDeliveryDate?: Date | null;
}

function escapeHtml(input: string): string {
  return input
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number): string {
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: Date): string {
  return format(d, "dd.MM.yyyy", { locale: tr });
}

export function generateOrderHtml(data: OrderPdfData): string {
  const {
    orderNumber,
    orderDate,
    tenderNumber,
    tenderTitle,
    buyerCompanyName,
    buyerTaxOffice,
    buyerTaxNumber,
    buyerAddress,
    buyerEmail,
    buyerPhone,
    supplierCompanyName,
    supplierTaxOffice,
    supplierTaxNumber,
    supplierAddress,
    supplierEmail,
    supplierPhone,
    deliveryAddress,
    items,
    subtotal,
    vatRate,
    vatAmount,
    total,
    currency,
    statusLabel,
    bidNotes,
    deliveryNote,
    expectedDeliveryDate,
  } = data;

  const safeCurrency = escapeHtml(currency);

  return `<!DOCTYPE html>
<html lang="tr">
<head>
<meta charset="UTF-8">
<title>Sipariş ${escapeHtml(orderNumber)}</title>
<style>
  @page { size: A4; margin: 0; }
  * { box-sizing: border-box; }
  body {
    font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
    color: #0f172a;
    margin: 0;
    padding: 0;
    font-size: 11px;
    line-height: 1.4;
  }
  .header {
    background: linear-gradient(135deg, #2563eb 0%, #1e40af 100%);
    color: white;
    padding: 24px 32px;
    margin-bottom: 24px;
  }
  .header-flex {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
  }
  .logo {
    font-family: "Plus Jakarta Sans", -apple-system, sans-serif;
    font-size: 28px;
    font-weight: 800;
    letter-spacing: -1px;
  }
  .logo-tag {
    color: #93c5fd;
  }
  .logo-sub {
    font-size: 10px;
    opacity: 0.85;
    margin-top: 4px;
    letter-spacing: 0.5px;
  }
  .header-meta { text-align: right; }
  .header-meta-label {
    font-size: 10px;
    opacity: 0.85;
    text-transform: uppercase;
    letter-spacing: 0.5px;
  }
  .header-meta-value {
    font-size: 18px;
    font-weight: 700;
    font-family: "SF Mono", Consolas, monospace;
    margin-top: 2px;
  }
  .header-status {
    display: inline-block;
    background: rgba(255,255,255,0.22);
    padding: 4px 12px;
    border-radius: 4px;
    font-size: 10px;
    font-weight: 700;
    text-transform: uppercase;
    margin-top: 8px;
    letter-spacing: 0.5px;
  }
  .section { padding: 0 32px; margin-bottom: 18px; }
  .section-title {
    font-size: 11px;
    font-weight: 700;
    text-transform: uppercase;
    color: #475569;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
    border-bottom: 1px solid #e2e8f0;
    padding-bottom: 4px;
  }
  .grid-2 {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
  }
  .info-card {
    background: #f8fafc;
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 14px;
  }
  .info-card-title {
    font-size: 10px;
    font-weight: 700;
    color: #2563eb;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .info-card-name {
    font-size: 13px;
    font-weight: 700;
    color: #0f172a;
    margin-bottom: 6px;
  }
  .info-card-line {
    font-size: 10px;
    color: #475569;
    margin: 2px 0;
  }
  .info-card-line strong { color: #0f172a; }

  table {
    width: 100%;
    border-collapse: collapse;
    margin-top: 8px;
    font-size: 10px;
  }
  table thead {
    background: #1e40af;
    color: white;
  }
  table thead th {
    padding: 9px 6px;
    text-align: left;
    font-weight: 600;
    font-size: 10px;
    text-transform: uppercase;
    letter-spacing: 0.3px;
  }
  table thead th.right { text-align: right; }
  table tbody tr { border-bottom: 1px solid #e2e8f0; }
  table tbody td { padding: 8px 6px; vertical-align: top; }
  table tbody td.right {
    text-align: right;
    font-family: "SF Mono", Consolas, monospace;
  }
  .item-name { font-weight: 600; color: #0f172a; }
  .item-desc {
    font-size: 9px;
    color: #64748b;
    margin-top: 2px;
  }

  .totals {
    margin-top: 16px;
    padding: 12px 16px;
    background: #f0f9ff;
    border: 1px solid #bae6fd;
    border-radius: 8px;
  }
  .totals-row {
    display: flex;
    justify-content: space-between;
    padding: 4px 0;
    font-size: 11px;
  }
  .totals-row.grand {
    border-top: 2px solid #2563eb;
    padding-top: 8px;
    margin-top: 4px;
    font-size: 14px;
    font-weight: 700;
    color: #1e40af;
  }
  .totals-amount {
    font-family: "SF Mono", Consolas, monospace;
  }

  .signatures {
    display: grid;
    grid-template-columns: 1fr 1fr;
    gap: 24px;
    margin-top: 28px;
    page-break-inside: avoid;
  }
  .signature-box {
    border: 1px solid #cbd5e1;
    border-radius: 8px;
    padding: 12px;
    min-height: 90px;
  }
  .signature-label {
    font-size: 10px;
    font-weight: 700;
    color: #475569;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    margin-bottom: 6px;
  }
  .signature-name {
    font-size: 11px;
    font-weight: 600;
    margin-bottom: 24px;
    color: #0f172a;
  }
  .signature-line {
    border-top: 1px dashed #94a3b8;
    padding-top: 4px;
    font-size: 9px;
    color: #64748b;
    text-align: center;
  }

  .footer {
    margin-top: 18px;
    padding: 12px 32px;
    border-top: 1px solid #e2e8f0;
    font-size: 9px;
    color: #64748b;
    text-align: center;
  }
  .footer strong { color: #2563eb; }

  .notes-box {
    background: #fef3c7;
    border-left: 3px solid #f59e0b;
    padding: 8px 12px;
    margin-top: 8px;
    font-size: 10px;
    color: #78350f;
  }
  .notes-title {
    font-weight: 700;
    margin-bottom: 4px;
    text-transform: uppercase;
    font-size: 9px;
    letter-spacing: 0.5px;
  }
  .notes-body { white-space: pre-wrap; }

  .pre-line { white-space: pre-line; }
</style>
</head>
<body>
<div class="header">
  <div class="header-flex">
    <div>
      <div class="logo">sup<span class="logo-tag">keys</span></div>
      <div class="logo-sub">B2B Tedarik &amp; Satınalma</div>
    </div>
    <div class="header-meta">
      <div class="header-meta-label">Sipariş No</div>
      <div class="header-meta-value">${escapeHtml(orderNumber)}</div>
      <div class="header-status">${escapeHtml(statusLabel)}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="grid-2">
    <div>
      <div class="section-title">Sipariş Bilgileri</div>
      <div style="font-size:11px;">
        <div style="margin:4px 0;"><strong>Tarih:</strong> ${fmtDate(orderDate)}</div>
        <div style="margin:4px 0;"><strong>İhale Referansı:</strong> ${escapeHtml(tenderNumber)}</div>
        <div style="margin:4px 0;"><strong>İhale Başlığı:</strong> ${escapeHtml(tenderTitle)}</div>
        ${
          expectedDeliveryDate
            ? `<div style="margin:4px 0;"><strong>Tahmini Teslim:</strong> ${fmtDate(expectedDeliveryDate)}</div>`
            : ""
        }
      </div>
    </div>
    <div>
      <div class="section-title">Teslimat Adresi</div>
      <div class="pre-line" style="font-size:11px;">${escapeHtml(deliveryAddress)}</div>
    </div>
  </div>
</div>

<div class="section">
  <div class="grid-2">
    <div class="info-card">
      <div class="info-card-title">Alıcı</div>
      <div class="info-card-name">${escapeHtml(buyerCompanyName)}</div>
      ${
        buyerTaxOffice
          ? `<div class="info-card-line"><strong>Vergi Dairesi:</strong> ${escapeHtml(buyerTaxOffice)}</div>`
          : ""
      }
      ${
        buyerTaxNumber
          ? `<div class="info-card-line"><strong>VKN:</strong> ${escapeHtml(buyerTaxNumber)}</div>`
          : ""
      }
      <div class="info-card-line"><strong>Adres:</strong> <span class="pre-line">${escapeHtml(buyerAddress)}</span></div>
      ${
        buyerPhone
          ? `<div class="info-card-line"><strong>Telefon:</strong> ${escapeHtml(buyerPhone)}</div>`
          : ""
      }
      ${
        buyerEmail
          ? `<div class="info-card-line"><strong>E-posta:</strong> ${escapeHtml(buyerEmail)}</div>`
          : ""
      }
    </div>
    <div class="info-card">
      <div class="info-card-title">Tedarikçi</div>
      <div class="info-card-name">${escapeHtml(supplierCompanyName)}</div>
      ${
        supplierTaxOffice
          ? `<div class="info-card-line"><strong>Vergi Dairesi:</strong> ${escapeHtml(supplierTaxOffice)}</div>`
          : ""
      }
      ${
        supplierTaxNumber
          ? `<div class="info-card-line"><strong>VKN:</strong> ${escapeHtml(supplierTaxNumber)}</div>`
          : ""
      }
      ${
        supplierAddress
          ? `<div class="info-card-line"><strong>Adres:</strong> ${escapeHtml(supplierAddress)}</div>`
          : ""
      }
      ${
        supplierPhone
          ? `<div class="info-card-line"><strong>Telefon:</strong> ${escapeHtml(supplierPhone)}</div>`
          : ""
      }
      ${
        supplierEmail
          ? `<div class="info-card-line"><strong>E-posta:</strong> ${escapeHtml(supplierEmail)}</div>`
          : ""
      }
    </div>
  </div>
</div>

<div class="section">
  <div class="section-title">Sipariş Kalemleri</div>
  <table>
    <thead>
      <tr>
        <th style="width:30px;">#</th>
        <th>Ürün / Hizmet</th>
        <th style="width:70px;" class="right">Miktar</th>
        <th style="width:50px;">Birim</th>
        <th style="width:100px;" class="right">Birim Fiyat</th>
        <th style="width:110px;" class="right">Toplam</th>
      </tr>
    </thead>
    <tbody>
      ${items
        .map(
          (item, idx) => `
        <tr>
          <td>${idx + 1}</td>
          <td>
            <div class="item-name">${escapeHtml(item.name)}</div>
            ${item.description ? `<div class="item-desc">${escapeHtml(item.description)}</div>` : ""}
          </td>
          <td class="right">${fmtMoney(item.quantity)}</td>
          <td>${escapeHtml(item.unit)}</td>
          <td class="right">${fmtMoney(item.unitPrice)} ${safeCurrency}</td>
          <td class="right"><strong>${fmtMoney(item.totalPrice)} ${safeCurrency}</strong></td>
        </tr>`,
        )
        .join("")}
    </tbody>
  </table>

  <div class="totals">
    <div class="totals-row">
      <span>Ara Toplam (KDV Hariç):</span>
      <span class="totals-amount">${fmtMoney(subtotal)} ${safeCurrency}</span>
    </div>
    <div class="totals-row">
      <span>KDV (%${vatRate}):</span>
      <span class="totals-amount">${fmtMoney(vatAmount)} ${safeCurrency}</span>
    </div>
    <div class="totals-row grand">
      <strong>GENEL TOPLAM:</strong>
      <span class="totals-amount">${fmtMoney(total)} ${safeCurrency}</span>
    </div>
  </div>
</div>

${
  bidNotes || deliveryNote
    ? `<div class="section">
  <div class="section-title">Notlar</div>
  ${
    bidNotes
      ? `<div class="notes-box">
        <div class="notes-title">Teklif Notu</div>
        <div class="notes-body">${escapeHtml(bidNotes)}</div>
      </div>`
      : ""
  }
  ${
    deliveryNote
      ? `<div class="notes-box" style="margin-top:6px;">
        <div class="notes-title">Teslimat Notu</div>
        <div class="notes-body">${escapeHtml(deliveryNote)}</div>
      </div>`
      : ""
  }
</div>`
    : ""
}

<div class="section">
  <div class="signatures">
    <div class="signature-box">
      <div class="signature-label">Alıcı</div>
      <div class="signature-name">${escapeHtml(buyerCompanyName)}</div>
      <div class="signature-line">İmza &amp; Tarih</div>
    </div>
    <div class="signature-box">
      <div class="signature-label">Tedarikçi</div>
      <div class="signature-name">${escapeHtml(supplierCompanyName)}</div>
      <div class="signature-line">İmza &amp; Tarih</div>
    </div>
  </div>
</div>

<div class="footer">
  Bu belge <strong>Supkeys</strong> üzerinden ${fmtDate(new Date())} tarihinde oluşturulmuştur.<br>
  <strong>supkeys.com</strong> · B2B Tedarik &amp; Satınalma Platformu
</div>
</body>
</html>`;
}
