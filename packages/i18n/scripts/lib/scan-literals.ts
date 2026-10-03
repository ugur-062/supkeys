import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";
import ts from "typescript";

/** Türkçeye özgü harfler — sabit metin sezgiseli (yorumlar SAYILMAZ, yalnız literal). */
export const TURKISH_RE = /[çğışöüÇĞİŞÖÜ]/;

/**
 * Kaynak dosyadaki Türkçe harf taşıyan dize literallerini ve JSX metinlerini
 * sayar. TypeScript tarayıcısıyla: yorumlar, tanımlayıcılar ve import yolları
 * kapsam DIŞI; `"…"`, `'…'`, şablon parçaları ve `<p>metin</p>` kapsam İÇİ.
 */
export function countTurkishLiterals(source: string, fileName = "x.tsx"): number {
  const kind = fileName.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sf = ts.createSourceFile(fileName, source, ts.ScriptTarget.ES2022, true, kind);
  let count = 0;
  const visit = (node: ts.Node): void => {
    if (
      ts.isStringLiteral(node) ||
      ts.isNoSubstitutionTemplateLiteral(node) ||
      ts.isTemplateHead(node) ||
      ts.isTemplateMiddle(node) ||
      ts.isTemplateTail(node) ||
      ts.isJsxText(node)
    ) {
      if (TURKISH_RE.test(node.text)) count++;
      return;
    }
    ts.forEachChild(node, visit);
  };
  visit(sf);
  return count;
}

export interface ScanOptions {
  /** Depo köküne göre taranacak dizinler. */
  scopes: string[];
  /** Yol içinde geçerse atlanır (dizin adı ya da dosya adı parçası). */
  exclude: string[];
}

export const DEFAULT_SCAN: ScanOptions = {
  scopes: ["apps/web/src", "apps/api/src", "packages/shared/src", "packages/email/src"],
  exclude: [
    "/__tests__/",
    ".test.",
    ".spec.",
    ".d.ts",
    "/e2e/",
    // Veri dosyaları: il/ülke adları metin değil veri.
    "packages/shared/src/data/",
  ],
};

/** Depoyu tarar; yalnız sayısı > 0 olan dosyaları döner (`depo/göreli/yol` → sayı). */
export function scanRepo(repoRoot: string, options: ScanOptions = DEFAULT_SCAN): Record<string, number> {
  const out: Record<string, number> = {};
  const walk = (dir: string): void => {
    for (const entry of readdirSync(dir)) {
      const full = path.join(dir, entry);
      const rel = path.relative(repoRoot, full).split(path.sep).join("/");
      if (entry === "node_modules" || entry === "dist" || entry === ".next") continue;
      const st = statSync(full);
      if (st.isDirectory()) {
        walk(full);
        continue;
      }
      if (!/\.(ts|tsx)$/.test(entry)) continue;
      const probe = `/${rel}`;
      if (options.exclude.some((ex) => probe.includes(ex) || entry.includes(ex))) continue;
      const count = countTurkishLiterals(readFileSync(full, "utf8"), entry);
      if (count > 0) out[rel] = count;
    }
  };
  for (const scope of options.scopes) {
    const abs = path.join(repoRoot, scope);
    try {
      if (statSync(abs).isDirectory()) walk(abs);
    } catch {
      // kapsam yoksa (ör. paket silinmiş) sessizce atla
    }
  }
  return Object.fromEntries(Object.entries(out).sort(([a], [b]) => a.localeCompare(b)));
}
