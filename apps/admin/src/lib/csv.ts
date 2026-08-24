/**
 * Ortak CSV indirme — Excel-TR uyumlu: UTF-8 BOM + noktalı virgül ayraç.
 * (3 sayfada kopyalanan builder tekleşti.)
 */
export function downloadCsv(
  filename: string,
  header: string[],
  rows: (string | number | null | undefined)[][],
): void {
  // FORMÜL ENJEKSİYONU koruması (denetim 2026-08-24 Parça 5): Excel/Sheets,
  // `=`, `+`, `-`, `@` (ve TAB/CR) ile başlayan hücreyi FORMÜL olarak
  // yorumlar — tırnak sarmak bunu engellemez. Firma ünvanı ve şikayet metni
  // gibi kullanıcı-yazımı alanlar bu CSV'lere ham giriyordu; dosyayı açan
  // admin'in makinesinde `=cmd|…` / `=HYPERLINK(…)` çalışabilirdi.
  // Değeri BOZMADAN nötrlemek için tek tırnak ön-eki kullanılır (Excel bunu
  // "metin" işareti sayar ve göstermez).
  const neutralize = (s: string) =>
    /^[=+\-@\t\r]/.test(s) ? `'${s}` : s;
  const esc = (v: unknown) =>
    `"${neutralize(String(v ?? "")).replaceAll('"', '""')}"`;
  const lines = rows.map((r) => r.map(esc).join(";"));
  const blob = new Blob(["﻿" + [header.join(";"), ...lines].join("\n")], {
    type: "text/csv;charset=utf-8",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
