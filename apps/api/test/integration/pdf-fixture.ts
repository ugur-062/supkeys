/**
 * El yapımı minimal PDF üretici (test fixture — harici PDF-yazma bağımlılığı yok).
 * pageTexts[i] null → o sayfada METİN KATMANI YOK (taranmış sayfa benzetimi).
 * Metin ≤60 karakterlik satırlara bölünür — pdfjs sayfa dışına taşan uzun
 * tek-satır metni metin çıkarımında KIRPIYOR (threshold altına düşürüyordu).
 */
export function makeSimplePdf(pageTexts: (string | null)[]): Buffer {
  const objs: { num: number; body: string }[] = [];
  const pageNums: number[] = [];
  let next = 4;
  for (const t of pageTexts) {
    const pageNum = next++;
    const contentNum = next++;
    pageNums.push(pageNum);
    const safe = (t ?? "").replace(/[\\()]/g, " ");
    const lines = safe.match(/.{1,60}/g) ?? [];
    const stream = t
      ? `BT /F1 12 Tf 14 TL 40 760 Td ${lines
          .map((l) => `(${l}) Tj T* `)
          .join("")}ET`
      : "";
    objs.push({
      num: pageNum,
      body: `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentNum} 0 R >>`,
    });
    objs.push({
      num: contentNum,
      body: `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
    });
  }
  const all = [
    { num: 1, body: `<< /Type /Catalog /Pages 2 0 R >>` },
    {
      num: 2,
      body: `<< /Type /Pages /Kids [${pageNums.map((n) => `${n} 0 R`).join(" ")}] /Count ${pageNums.length} >>`,
    },
    { num: 3, body: `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>` },
    ...objs,
  ].sort((a, b) => a.num - b.num);

  let out = "%PDF-1.4\n";
  const offsets: number[] = [];
  for (const o of all) {
    offsets[o.num] = out.length;
    out += `${o.num} 0 obj\n${o.body}\nendobj\n`;
  }
  const xrefStart = out.length;
  const size = all.length + 1;
  out += `xref\n0 ${size}\n0000000000 65535 f \n`;
  for (let i = 1; i < size; i++) {
    out += `${String(offsets[i] ?? 0).padStart(10, "0")} 00000 n \n`;
  }
  out += `trailer\n<< /Size ${size} /Root 1 0 R >>\nstartxref\n${xrefStart}\n%%EOF`;
  return Buffer.from(out, "latin1");
}
