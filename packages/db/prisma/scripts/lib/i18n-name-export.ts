/**
 * `export-category-names-i18n` KORUMASI (2026-10-09) — saf fark hesabı.
 *
 * `category-names.i18n.tsv` EN/RU kategori adlarının TEK kaynağıdır
 * (`seed-categories` ve `apply-category-names-i18n` oradan okur). Dışa aktarım
 * betiği dosyayı veritabanından YENİDEN yazar; dosya elle düzeltildikten sonra
 * (2026-10-07 terim incelemesi, 2026-10-09 "Logistics" yeniden adlandırması)
 * `apply-category-names-i18n` HENÜZ koşulmamış bir veritabanına karşı
 * çalıştırılırsa eski adları ("Transportation and Storage and Mail Services")
 * sessizce dosyaya geri koyuyordu.
 *
 * Kural: dosyadaki MEVCUT bir satırı değiştirecek ya da düşürecek dışa aktarım
 * açık onay (`--overwrite`) ister; yalnız YENİ satır ekleyen dışa aktarım
 * (toplu çeviri sonrası olağan yol) onaysız yazılır. Fark özeti her koşuda basılır.
 * Sözleşme: API `test/unit/seed-category-guard.spec.ts`.
 */
export interface I18nNames {
  en: string | null;
  ru: string | null;
}

export interface I18nNameRow extends I18nNames {
  code: string;
}

export interface I18nExportDiff {
  /** Dosyada ve veritabanında aynı. */
  unchanged: number;
  /** Veritabanında var, dosyada yok — eklenecek. */
  added: I18nNameRow[];
  /** İkisinde de var, adı farklı — veritabanındaki ad dosyadakinin ÜSTÜNE yazılacak. */
  changed: { code: string; file: I18nNames; db: I18nNames }[];
  /** Dosyada var, veritabanında (EN/RU adıyla) yok — dosyadan DÜŞECEK. */
  dropped: I18nNameRow[];
}

/** TSV hücresi: sekme/satır sonu boşluğa, baş-son boşluk kırpılır; boş = çeviri yok. */
export function cleanI18nCell(v: string | null | undefined): string | null {
  return (v ?? "").replace(/[\t\r\n]+/g, " ").trim() || null;
}

/** Veritabanı satırlarını dışa aktarım biçimine çevirir (kod sırası, boş satırlar atılır). */
export function toI18nExportRows(
  db: readonly { code: string; nameEn: string | null; nameRu: string | null }[],
): I18nNameRow[] {
  return db
    .map((r) => ({ code: r.code, en: cleanI18nCell(r.nameEn), ru: cleanI18nCell(r.nameRu) }))
    .filter((r) => r.en !== null || r.ru !== null)
    .sort((a, b) => (a.code < b.code ? -1 : a.code > b.code ? 1 : 0));
}

export function diffI18nNameExport(file: ReadonlyMap<string, I18nNames>, rows: readonly I18nNameRow[]): I18nExportDiff {
  const diff: I18nExportDiff = { unchanged: 0, added: [], changed: [], dropped: [] };
  const seen = new Set<string>();
  for (const row of rows) {
    seen.add(row.code);
    const cur = file.get(row.code);
    if (!cur) diff.added.push(row);
    else if (cur.en === row.en && cur.ru === row.ru) diff.unchanged++;
    else diff.changed.push({ code: row.code, file: { en: cur.en, ru: cur.ru }, db: { en: row.en, ru: row.ru } });
  }
  for (const [code, cur] of file) {
    if (!seen.has(code)) diff.dropped.push({ code, en: cur.en, ru: cur.ru });
  }
  return diff;
}

/** Dışa aktarım dosyadaki mevcut bir satırı değiştirir ya da düşürür mü? (→ `--overwrite` gerekir) */
export function exportOverwritesFile(diff: I18nExportDiff): boolean {
  return diff.changed.length > 0 || diff.dropped.length > 0;
}

export type I18nExportAction = "dry" | "noop" | "refuse" | "write";

/**
 * Betiğin TEK kararı: fark + bayraklar → ne yapılacak.
 *   dry     `--dry`: yalnız özet, dosyaya dokunulmaz
 *   noop    dosya zaten veritabanıyla aynı
 *   refuse  mevcut satır değişecek/düşecek ve `--overwrite` YOK → yazılmaz, çıkış 1
 *   write   yalnız yeni satır var ya da `--overwrite` verildi
 */
export function planI18nNameExport(diff: I18nExportDiff, flags: { dry: boolean; overwrite: boolean }): I18nExportAction {
  if (flags.dry) return "dry";
  if (diff.added.length === 0 && !exportOverwritesFile(diff)) return "noop";
  if (exportOverwritesFile(diff) && !flags.overwrite) return "refuse";
  return "write";
}

/** Operatöre basılan fark özeti (ilk `limit` örnekle). */
export function formatI18nExportDiff(diff: I18nExportDiff, limit = 20): string[] {
  const cell = (n: I18nNames) => `${n.en ?? "-"} | ${n.ru ?? "-"}`;
  const out = [
    `diff (file -> database export): ${diff.unchanged} unchanged, ${diff.added.length} new, ` +
      `${diff.changed.length} changed, ${diff.dropped.length} dropped`,
  ];
  if (diff.changed.length) {
    out.push(`changed (file name would be REPLACED by the database name), first ${Math.min(limit, diff.changed.length)}:`);
    for (const c of diff.changed.slice(0, limit)) out.push(`  ${c.code}  file: ${cell(c.file)}  ->  db: ${cell(c.db)}`);
  }
  if (diff.dropped.length) {
    out.push(`dropped (in the file, no EN/RU name in the database), first ${Math.min(limit, diff.dropped.length)}:`);
    for (const d of diff.dropped.slice(0, limit)) out.push(`  ${d.code}  ${cell(d)}`);
  }
  if (diff.added.length) {
    out.push(`new (not in the file yet), first ${Math.min(limit, diff.added.length)}:`);
    for (const a of diff.added.slice(0, limit)) out.push(`  ${a.code}  ${cell(a)}`);
  }
  return out;
}

/** Dosya başındaki açıklama bloğu (elle düzenlenmiş başlık korunur); yoksa varsayılan. */
export function leadingCommentBlock(fileText: string | null, fallback: readonly string[]): string[] {
  if (fileText === null) return [...fallback];
  const head: string[] = [];
  for (const line of fileText.split("\n")) {
    if (!line.startsWith("#")) break;
    head.push(line);
  }
  return head.length ? head : [...fallback];
}
