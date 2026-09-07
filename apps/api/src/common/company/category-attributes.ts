import type { PrismaClient } from "@rothern/db";
import { categoryAncestors, isCategoryCode } from "@rothern/shared";

/**
 * KATEGORİ NİTELİK ÇÖZÜMLEYİCİSİ — TEK KAYNAK.
 *
 * İki yer aynı kararı vermek zorunda ve ayrışırlarsa panelde sorulan nitelik
 * ile vitrinde gösterilen etiket farklı olurdu:
 *   · panel formu (hangi alanlar sorulacak),
 *   · herkese açık ürün sayfası (kaydedilmiş anahtarın ETİKETİ ne).
 *
 * Nitelikler kategori ağacında YUKARIDAN miras alınır; zincir koddan türer
 * (`categoryAncestors`), ağaçta gezinme yok — tek `IN` sorgusu.
 *
 * Aynı `groupKey` birden çok düğümde tanımlıysa DAHA SPESİFİK olan kazanır:
 * aile, segmentin niteliğini daraltabilsin diye (ör. segmentte "IP sınıfı"
 * iki seçenek, pano ailesinde üç seçenek).
 */
export interface ResolvedAttribute {
  key: string;
  nameTr: string;
  type: string;
  options: string[];
  unit: string | null;
  isRequired: boolean;
  /** Hangi düğümden geldi — formda "segmentten miras" göstermek için. */
  definedAt: string;
}

export async function resolveCategoryAttributes(
  prisma: Pick<PrismaClient, "categoryAttribute">,
  categoryId: string | null | undefined,
): Promise<ResolvedAttribute[]> {
  if (!categoryId || !isCategoryCode(categoryId)) return [];
  const chain = categoryAncestors(categoryId);
  const rows = await prisma.categoryAttribute.findMany({
    where: { categoryId: { in: chain } },
    orderBy: [{ sortOrder: "asc" }, { nameTr: "asc" }],
  });

  // Spesifiklik = zincirdeki sıra (segment en genel, yaprak en özel).
  const rank = new Map(chain.map((c, i) => [c, i]));
  const byKey = new Map<string, (typeof rows)[number]>();
  for (const r of rows) {
    const cur = byKey.get(r.groupKey);
    if (!cur || (rank.get(r.categoryId) ?? 0) >= (rank.get(cur.categoryId) ?? 0)) {
      byKey.set(r.groupKey, r);
    }
  }

  return [...byKey.values()]
    .sort(
      (a, b) =>
        a.sortOrder - b.sortOrder || a.nameTr.localeCompare(b.nameTr, "tr"),
    )
    .map(toResolved);
}

/** Satır → `ResolvedAttribute` (tekil ve toplu çözümleyici AYNI eşleme). */
function toResolved(r: {
  groupKey: string;
  nameTr: string;
  type: string;
  options: string[];
  unit: string | null;
  isRequired: boolean;
  categoryId: string;
}): ResolvedAttribute {
  return {
    key: r.groupKey,
    nameTr: r.nameTr,
    type: r.type,
    options: r.options,
    unit: r.unit,
    isRequired: r.isRequired,
    definedAt: r.categoryId,
  };
}

/**
 * Kaydedilmiş `attributes` JSON'ını GÖSTERİM için etiketleyip sıralar.
 *
 * Tanımı bulunamayan anahtar DÜŞER: kategori değiştirilmiş ve eski nitelik
 * artık geçersizse ziyaretçiye ham anahtar (`koruma_sinifi`) göstermek yerine
 * hiç göstermemek doğru — veri değil, görüntü kararı.
 */
export function labelAttributes(
  stored: unknown,
  defs: ResolvedAttribute[],
): { key: string; label: string; value: string; unit: string | null }[] {
  if (!stored || typeof stored !== "object") return [];
  const byKey = new Map(defs.map((d) => [d.key, d]));
  const out: { key: string; label: string; value: string; unit: string | null }[] =
    [];
  for (const d of defs) {
    const raw = (stored as Record<string, unknown>)[d.key];
    if (raw == null || raw === "") continue;
    const value = Array.isArray(raw) ? raw.join(", ") : String(raw);
    out.push({ key: d.key, label: d.nameTr, value, unit: d.unit });
  }
  // Tanımda olmayan ama kayıtta duran anahtarlar bilinçli olarak atlanır.
  void byKey;
  return out;
}

/**
 * TOPLU çözümleme — bir sayfadaki N ürünün kategorisi için TEK sorgu.
 *
 * `resolveCategoryAttributes` kategori başına bir sorgu atar; ürün dizininde
 * 24 kart × ~10 ayrı kategori = 10 gidiş-dönüş demekti. Burada tüm
 * kategorilerin ata zincirleri birleştirilip bir `IN` ile çekilir, aynı
 * spesifiklik kuralı kategori başına bellekte uygulanır.
 */
export async function resolveCategoryAttributesBatch(
  prisma: Pick<PrismaClient, "categoryAttribute">,
  categoryIds: (string | null | undefined)[],
): Promise<Map<string, ResolvedAttribute[]>> {
  const codes = [...new Set(categoryIds.filter((c): c is string => !!c && isCategoryCode(c)))];
  const out = new Map<string, ResolvedAttribute[]>();
  if (codes.length === 0) return out;
  const chains = new Map(codes.map((c) => [c, categoryAncestors(c)]));
  const all = [...new Set([...chains.values()].flat())];
  const rows = await prisma.categoryAttribute.findMany({
    where: { categoryId: { in: all } },
    orderBy: [{ sortOrder: "asc" }, { nameTr: "asc" }],
  });
  const byNode = new Map<string, typeof rows>();
  for (const r of rows) byNode.set(r.categoryId, [...(byNode.get(r.categoryId) ?? []), r]);
  for (const [code, chain] of chains) {
    const rank = new Map(chain.map((c, i) => [c, i]));
    const byKey = new Map<string, (typeof rows)[number]>();
    for (const node of chain) {
      for (const r of byNode.get(node) ?? []) {
        const cur = byKey.get(r.groupKey);
        if (!cur || (rank.get(r.categoryId) ?? 0) >= (rank.get(cur.categoryId) ?? 0)) byKey.set(r.groupKey, r);
      }
    }
    out.set(
      code,
      [...byKey.values()]
        .sort((a, b) => a.sortOrder - b.sortOrder || a.nameTr.localeCompare(b.nameTr, "tr"))
        .map(toResolved),
    );
  }
  return out;
}
