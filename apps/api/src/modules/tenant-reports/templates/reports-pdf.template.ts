import { format } from "date-fns";
import { tr } from "date-fns/locale";

type GeneralResult = Awaited<
  ReturnType<
    typeof import("../services/tenant-reports.service").TenantReportsService.prototype.general
  >
>;
type SavingsResult = Awaited<
  ReturnType<
    typeof import("../services/tenant-reports.service").TenantReportsService.prototype.savings
  >
>;
type BidComparisonResult = Awaited<
  ReturnType<
    typeof import("../services/tenant-reports.service").TenantReportsService.prototype.bidComparison
  >
>;

function escapeHtml(input: string | number | null | undefined): string {
  if (input === null || input === undefined) return "-";
  return String(input)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function fmtMoney(n: number | null): string {
  if (n === null) return "-";
  return n.toLocaleString("tr-TR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtDate(d: string): string {
  return format(new Date(d), "dd.MM.yyyy HH:mm", { locale: tr });
}

const BASE_CSS = `
  <style>
    * { box-sizing: border-box; font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; }
    body { margin: 0; padding: 24px; color: #0f172a; font-size: 11px; }
    h1 { color: #1e3a8a; font-size: 22px; margin: 0 0 4px; }
    h2 { color: #334155; font-size: 14px; margin: 16px 0 8px; }
    .meta { color: #64748b; font-size: 10px; margin-bottom: 16px; }
    table { width: 100%; border-collapse: collapse; margin-top: 8px; }
    th { background: #1e3a8a; color: #fff; padding: 8px 6px; text-align: left; font-size: 10px; }
    td { padding: 6px; border-bottom: 1px solid #e2e8f0; font-size: 10px; }
    tr:nth-child(even) td { background: #f8fafc; }
    .summary { background: #dbeafe; padding: 12px; border-radius: 6px; margin-top: 16px; }
    .summary .label { color: #1e3a8a; font-weight: 600; font-size: 12px; }
    .summary .value { font-size: 16px; font-weight: 700; color: #0f172a; }
    .badge { display: inline-block; padding: 2px 6px; border-radius: 4px; font-size: 9px; font-weight: 600; }
    .badge-blue { background: #dbeafe; color: #1e40af; }
    .badge-green { background: #d1fae5; color: #065f46; }
    .badge-red { background: #fee2e2; color: #991b1b; }
    .footer { margin-top: 24px; color: #94a3b8; font-size: 9px; text-align: center; }
    .right { text-align: right; }
    .center { text-align: center; }
  </style>
`;

export function generateGeneralReportHtml(data: GeneralResult): string {
  const range =
    data.mode === "RANGE"
      ? `<div class="meta">Aralık: ${fmtDate(data.rangeStart!)} – ${fmtDate(data.rangeEnd!)}</div>`
      : "";

  const rows = data.tenders
    .map(
      (t) => `
    <tr>
      <td><strong>${escapeHtml(t.tenderNumber)}</strong></td>
      <td>${escapeHtml(t.title)}</td>
      <td><span class="badge badge-blue">${escapeHtml(t.type)}</span></td>
      <td>${escapeHtml(t.status)}</td>
      <td>${escapeHtml(t.currency)}</td>
      <td class="center">#${t.roundNumber}</td>
      <td>${fmtDate(t.bidsCloseAt)}</td>
      <td class="center">${t.invitedCount}</td>
      <td class="center">${t.submittedBidCount}</td>
      <td class="right">${fmtMoney(t.winningTotal)}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body>
    <h1>Genel İhale Raporu</h1>
    <div class="meta">Oluşturulma: ${fmtDate(data.generatedAt)}</div>
    ${range}

    <table>
      <thead>
        <tr>
          <th>İhale No</th><th>Başlık</th><th>Tip</th><th>Statü</th><th>Para</th>
          <th class="center">Tur</th><th>Kapanış</th>
          <th class="center">Davetli</th><th class="center">Teklif</th>
          <th class="right">Kazanan Tutar</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="10" class="center">Sonuç bulunamadı</td></tr>'}</tbody>
    </table>

    <div class="summary">
      <div class="label">Özet</div>
      <div>Toplam İhale: <strong>${data.summary.totalTenders}</strong> · Kazandırılan: <strong>${data.summary.awardedTenders}</strong> · Toplam Kazanan Tutar: <strong>${fmtMoney(data.summary.totalAwardedValue)}</strong></div>
    </div>

    <div class="footer">Supkeys — Bu rapor otomatik üretilmiştir.</div>
  </body></html>`;
}

export function generateSavingsReportHtml(data: SavingsResult): string {
  const rows = data.rows
    .map(
      (r) => `
    <tr>
      <td><strong>${escapeHtml(r.tenderNumber)}</strong></td>
      <td>${escapeHtml(r.title)}</td>
      <td>${escapeHtml(r.currency)}</td>
      <td class="right">${fmtMoney(r.targetTotal)}</td>
      <td class="right">${fmtMoney(r.actualTotal)}</td>
      <td class="right"><strong>${fmtMoney(r.savings)}</strong></td>
      <td class="right">${r.savingsPct !== null ? r.savingsPct.toFixed(2) + "%" : "-"}</td>
      <td>${escapeHtml(r.winners.map((w) => w.name).join(", "))}</td>
    </tr>`,
    )
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body>
    <h1>Tasarruf Raporu</h1>
    <div class="meta">Oluşturulma: ${fmtDate(data.generatedAt)}</div>
    <div class="meta">Aralık: ${fmtDate(data.rangeStart)} – ${fmtDate(data.rangeEnd)}${data.currency ? ` · ${escapeHtml(data.currency)}` : ""}</div>

    <table>
      <thead>
        <tr>
          <th>İhale No</th><th>Başlık</th><th>Para</th>
          <th class="right">Hedef</th><th class="right">Kazanan</th>
          <th class="right">Tasarruf</th><th class="right">%</th>
          <th>Tedarikçi</th>
        </tr>
      </thead>
      <tbody>${rows || '<tr><td colspan="8" class="center">AWARDED ihale bulunamadı</td></tr>'}</tbody>
    </table>

    <div class="summary">
      <div class="label">Genel Toplam</div>
      <div>Toplam İhale: <strong>${data.summary.totalTenders}</strong></div>
      <div>Hedef: <strong>${fmtMoney(data.summary.grandTarget)}</strong></div>
      <div>Kazanan: <strong>${fmtMoney(data.summary.grandActual)}</strong></div>
      <div class="value">Toplam Tasarruf: ${fmtMoney(data.summary.grandSavings)} (${data.summary.grandSavingsPct.toFixed(2)}%)</div>
    </div>

    <div class="footer">Supkeys — Bu rapor otomatik üretilmiştir.</div>
  </body></html>`;
}

export function generateBidComparisonReportHtml(
  data: BidComparisonResult,
): string {
  const sections = data.rounds
    .map((round) => {
      const supplierCols = round.suppliers.length;
      const colsPerSupplier =
        (data.includePrice ? 2 : 0) + (data.includeAnswers ? 1 : 0);

      const supplierHeaders = round.suppliers
        .map((s) => {
          const span = colsPerSupplier;
          return `<th colspan="${span}" class="center">${escapeHtml(s.companyName)}${!s.submitted ? " (Teklif yok)" : ""}</th>`;
        })
        .join("");

      const subHeaders = round.suppliers
        .map(() => {
          let cells = "";
          if (data.includePrice) {
            cells += `<th class="right">Birim ₺</th><th class="right">Toplam ₺</th>`;
          }
          if (data.includeAnswers) {
            cells += `<th>Yanıt</th>`;
          }
          return cells;
        })
        .join("");

      const itemRows = round.items
        .map((item) => {
          const supplierCells = round.suppliers
            .map((s) => {
              let cells = "";
              if (data.includePrice) {
                const ip = s.itemPrices.find(
                  (x) => x.tenderItemId === item.id,
                );
                cells += `<td class="right">${fmtMoney(ip?.unitPrice ?? null)}</td>`;
                cells += `<td class="right">${fmtMoney(ip?.totalPrice ?? null)}</td>`;
              }
              if (data.includeAnswers) {
                const ia = s.itemAnswers.find(
                  (x) => x.tenderItemId === item.id,
                );
                cells += `<td>${escapeHtml(ia?.customAnswer ?? "")}</td>`;
              }
              return cells;
            })
            .join("");
          return `<tr>
            <td><strong>${escapeHtml(item.name)}</strong></td>
            <td class="center">${item.quantity} ${escapeHtml(item.unit)}</td>
            <td class="right">${fmtMoney(item.targetUnitPrice)}</td>
            ${supplierCells}
          </tr>`;
        })
        .join("");

      const totalRow = data.includePrice
        ? `<tr style="background:#dbeafe;font-weight:700">
            <td colspan="3">GENEL TOPLAM</td>
            ${round.suppliers
              .map((s) => {
                let cells = `<td></td><td class="right">${fmtMoney(s.totalAmount)}</td>`;
                if (data.includeAnswers) cells += `<td></td>`;
                return cells;
              })
              .join("")}
          </tr>`
        : "";

      return `
        <h2>${escapeHtml(round.title)} — Tur #${round.roundNumber}</h2>
        <div class="meta">${escapeHtml(round.tenderNumber)} · ${escapeHtml(round.currency)} · ${supplierCols} tedarikçi</div>
        <table>
          <thead>
            <tr>
              <th rowspan="2">Kalem</th>
              <th rowspan="2" class="center">Adet/Birim</th>
              <th rowspan="2" class="right">Hedef Birim</th>
              ${supplierHeaders}
            </tr>
            <tr>${subHeaders}</tr>
          </thead>
          <tbody>${itemRows}${totalRow}</tbody>
        </table>
      `;
    })
    .join("");

  return `<!DOCTYPE html><html><head><meta charset="UTF-8">${BASE_CSS}</head><body>
    <h1>Teklif Karşılaştırma Raporu</h1>
    <div class="meta">Oluşturulma: ${fmtDate(data.generatedAt)}${data.includeAllRounds ? " · Tüm turlar" : ""}${data.includeNonBidders ? " · Teklif vermeyenler dahil" : ""}</div>
    ${sections}
    <div class="footer">Supkeys — Bu rapor otomatik üretilmiştir.</div>
  </body></html>`;
}
