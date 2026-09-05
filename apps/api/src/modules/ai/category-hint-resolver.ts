import { foldSearchText, tokenizeQuery } from "@rothern/shared";
import type { PrismaService } from "../../common/prisma/prisma.service";

/**
 * MODEL İFADESİ → GERÇEK KATEGORİ KODU — TEK KAYNAK (ürün çıkarımı + AI
 * arama). Model "dağıtım panosu" gibi Türkçe bir ürün tipi yazar; kod
 * BURADA katalogda aranarak bulunur (model kod yazamaz — geçerli görünen
 * ama yanlış dala düşen kod riski, bkz. product-extract).
 *
 * Sıralama: önce tam ad eşleşmesi, sonra token eşleşmesi; eşitlikte SINIF
 * (L3) emtiadan (L4) önce gelir — yanlış giderse genel olan az zarar verir.
 * Tek toplu sorgu + bulunamayan ifade için tekil yedek sorgu.
 */
export const MAX_HINTS = 60;
const CANDIDATE_TAKE = 600;

export interface ResolvedCategory {
  id: string;
  nameTr: string;
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

  const tokensOf = (h: string) => tokenizeQuery(h).map((t) => foldSearchText(t)).filter(Boolean);
  const clauses = distinct
    .map((h) => tokensOf(h))
    .filter((ts) => ts.length > 0)
    .map((ts) => ({ AND: ts.map((t) => ({ searchText: { contains: t } })) }));
  if (clauses.length === 0) return out;
  const gate = opts.discoveryOnly ? { inDiscovery: true } : {};

  const candidates = await prisma.category.findMany({
    where: { isActive: true, level: { in: [3, 4] }, ...gate, OR: clauses },
    select: { id: true, nameTr: true, level: true, searchText: true },
    orderBy: [{ level: "asc" }, { id: "asc" }],
    take: CANDIDATE_TAKE,
  });

  for (const hint of distinct) {
    const ts = tokensOf(hint);
    if (ts.length === 0) continue;
    const folded = foldSearchText(hint);
    const pool = candidates.filter((c) => ts.every((t) => (c.searchText ?? "").includes(t)));
    const best =
      pool.find((c) => foldSearchText(c.nameTr) === folded) ??
      // `orderBy` zaten L3'ü öne aldı; havuzdaki ilk aday en genel olandır.
      pool[0] ??
      // Toplu sorgu tavanına takıldıysa (çok popüler bir ifade) tekil dene.
      (await prisma.category.findFirst({
        where: {
          isActive: true,
          level: { in: [3, 4] },
          ...gate,
          AND: ts.map((t) => ({ searchText: { contains: t } })),
        },
        select: { id: true, nameTr: true },
        orderBy: [{ level: "asc" }, { id: "asc" }],
      }));
    if (best) out.set(hint, { id: best.id, nameTr: best.nameTr });
  }
  return out;
}
