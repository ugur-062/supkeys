import { foldSearchText, tokenizeQuery } from "@rothern/shared";
import type { PrismaService } from "../../common/prisma/prisma.service";

/**
 * MODEL İFADESİ → GERÇEK KATEGORİ KODU — TEK KAYNAK (ürün çıkarımı + AI
 * arama). Model "dağıtım panosu" gibi Türkçe bir ürün tipi yazar; kod
 * BURADA katalogda aranarak bulunur (model kod yazamaz — geçerli görünen
 * ama yanlış dala düşen kod riski, bkz. product-extract).
 *
 * Eşleştirme (2026-09-05 revizyonu — canlı bulgu: "kompanzasyon panosu"
 * anahtar kelimesi yüzünden bir MONTAJ HİZMETİ kategorisine düşüyordu):
 *  · Türkçe ek toleransı: ≥5 karakterli token ön ekiyle de aranır
 *    ("panosu" ~ "panoları" → "pano"); havuz ön ekle kurulur.
 *  · Sıralama AD ÖNCE: tam ad = tokenlerin tamamı ADDA (tam) › adda ön ekle ›
 *    tamamı searchText'te (anahtar kelime) › ön ekle searchText'te. Eşitlikte
 *    SINIF (L3) emtiadan (L4) önce — yanlış giderse genel olan az zarar verir.
 */
export const MAX_HINTS = 60;
const POOL_TAKE = 2000;
const SINGLE_TAKE = 300;

export interface ResolvedCategory {
  id: string;
  nameTr: string;
}

type Candidate = { id: string; nameTr: string; level: number; searchText: string | null };

/** Türkçe ekleri hoş gör: "panosu"/"panoları" → "pano", "kompanzasyon" → "kompanzas". */
export const stemPrefix = (t: string): string => (t.length >= 5 ? t.slice(0, Math.max(4, t.length - 3)) : t);

const tokensOf = (h: string) => tokenizeQuery(h).map((t) => foldSearchText(t)).filter(Boolean);

function score(c: Candidate, ts: string[], folded: string): number {
  const name = foldSearchText(c.nameTr);
  if (name === folded) return 6;
  if (ts.every((t) => name.includes(t))) return 5;
  if (ts.every((t) => name.includes(stemPrefix(t)))) return 4;
  const st = c.searchText ?? "";
  if (ts.every((t) => st.includes(t))) return 3;
  if (ts.every((t) => st.includes(stemPrefix(t)))) return 2;
  return 0;
}

function pick(pool: Candidate[], ts: string[], folded: string): Candidate | null {
  let best: Candidate | null = null;
  let bestScore = 0;
  for (const c of pool) {
    const sc = score(c, ts, folded);
    if (sc === 0) continue;
    if (
      !best ||
      sc > bestScore ||
      (sc === bestScore && (c.level < best.level || (c.level === best.level && c.id < best.id)))
    ) {
      best = c;
      bestScore = sc;
    }
  }
  return best;
}

export async function resolveCategoryHints(
  prisma: PrismaService,
  hints: (string | null)[],
  opts: {
    /** Talep/ilan kategorisi discovery kataloğunda olmalı (`inDiscovery`). */
    discoveryOnly?: boolean;
  } = {},
): Promise<Map<string, ResolvedCategory>> {
  const out = new Map<string, ResolvedCategory>();
  const distinct = [...new Set(hints.filter((h): h is string => !!h))].slice(0, MAX_HINTS);
  if (distinct.length === 0) return out;

  const clauseFor = (ts: string[]) => ({ AND: ts.map((t) => ({ searchText: { contains: stemPrefix(t) } })) });
  const clauses = distinct
    .map((h) => tokensOf(h))
    .filter((ts) => ts.length > 0)
    .map(clauseFor);
  if (clauses.length === 0) return out;
  const gate = opts.discoveryOnly ? { inDiscovery: true } : {};
  const select = { id: true, nameTr: true, level: true, searchText: true } as const;

  const pool: Candidate[] = await prisma.category.findMany({
    where: { isActive: true, level: { in: [3, 4] }, ...gate, OR: clauses },
    select,
    orderBy: [{ level: "asc" }, { id: "asc" }],
    take: POOL_TAKE,
  });

  for (const hint of distinct) {
    const ts = tokensOf(hint);
    if (ts.length === 0) continue;
    const folded = foldSearchText(hint);
    let best = pick(pool, ts, folded);
    if (!best) {
      // Toplu havuz tavanına takıldıysa (çok popüler bir ifade) tekil dene.
      const single: Candidate[] = await prisma.category.findMany({
        where: { isActive: true, level: { in: [3, 4] }, ...gate, ...clauseFor(ts) },
        select,
        orderBy: [{ level: "asc" }, { id: "asc" }],
        take: SINGLE_TAKE,
      });
      best = pick(single, ts, folded);
    }
    if (best) out.set(hint, { id: best.id, nameTr: best.nameTr });
  }
  return out;
}
