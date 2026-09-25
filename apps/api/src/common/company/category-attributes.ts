import type { PrismaClient } from "@rothern/db";
import { categoryAncestors, isCategoryCode } from "@rothern/shared";
import { currentLocale } from "../i18n/locale-context";

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
  /** GÖSTERİM etiketi — okuyucunun dilinde (i18n Faz 4b); alan adı geriye dönük. */
  nameTr: string;
  type: string;
  /** Kanonik (Türkçe) seçenekler — saklanan değer ve süzgeç parametresi bunlarla. */
  options: string[];
  /** Kanonik seçenek → okuyucunun dilindeki etiket (yalnız tr dışı dilde ve çeviri varsa). */
  optionLabels?: Record<string, string>;
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

/**
 * Nitelik BİRİMİ gösterimi okuyucunun dilinde (2026-09-25 çeviri denetimi:
 * EN sayfada "36 ay", "12 kişi" görünüyordu). Katalogdaki birim kümesi küçük
 * ve kapalı (seed `category-attributes.ts`); tanınmayan birim olduğu gibi.
 * Ay/kişi/saat kısaltmalı yazılır — "1 months" gibi çoğul hatası olmasın.
 */
const ATTRIBUTE_UNIT_I18N: Record<string, { en: string; ru: string }> = {
  ay: { en: "mo.", ru: "мес." },
  kişi: { en: "people", ru: "чел." },
  saat: { en: "h", ru: "ч" },
  ton: { en: "t", ru: "т" },
  "ton/saat": { en: "t/h", ru: "т/ч" },
  adet: { en: "pcs", ru: "шт" },
  mm: { en: "mm", ru: "мм" },
  m: { en: "m", ru: "м" },
  "m²": { en: "m²", ru: "м²" },
  km: { en: "km", ru: "км" },
  kg: { en: "kg", ru: "кг" },
  "g/m²": { en: "g/m²", ru: "г/м²" },
  kW: { en: "kW", ru: "кВт" },
  W: { en: "W", ru: "Вт" },
  V: { en: "V", ru: "В" },
  kVA: { en: "kVA", ru: "кВА" },
  bar: { en: "bar", ru: "бар" },
  HP: { en: "hp", ru: "л.с." },
  "Shore A": { en: "Shore A", ru: "по Шору A" },
};

export function attributeUnitLabel(unit: string | null, locale: string): string | null {
  if (!unit || (locale !== "en" && locale !== "ru")) return unit;
  return ATTRIBUTE_UNIT_I18N[unit]?.[locale] ?? unit;
}

/** Satır → `ResolvedAttribute` (tekil ve toplu çözümleyici AYNI eşleme). */
function toResolved(r: {
  groupKey: string;
  nameTr: string;
  nameEn?: string | null;
  nameRu?: string | null;
  type: string;
  options: string[];
  optionsEn?: string[];
  optionsRu?: string[];
  unit: string | null;
  isRequired: boolean;
  categoryId: string;
}): ResolvedAttribute {
  // i18n Faz 4b: etiket ve seçenek GÖSTERİMİ okuyucunun dilinde; kanonik değer Türkçe kalır.
  const locale = currentLocale();
  const name = locale === "en" ? r.nameEn?.trim() || r.nameTr : locale === "ru" ? r.nameRu?.trim() || r.nameTr : r.nameTr;
  const translated = locale === "en" ? r.optionsEn : locale === "ru" ? r.optionsRu : undefined;
  const optionLabels =
    translated && translated.length === r.options.length && translated.some((x) => x)
      ? Object.fromEntries(r.options.map((o, i) => [o, translated[i]?.trim() || o]))
      : undefined;
  return {
    key: r.groupKey,
    nameTr: name,
    type: r.type,
    options: r.options,
    ...(optionLabels ? { optionLabels } : {}),
    unit: attributeUnitLabel(r.unit, locale),
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
    // Seçenekli niteliklerde değer(ler) okuyucunun dilindeki seçenek etiketine çevrilir (i18n Faz 4b).
    const show = (v: unknown) => (d.optionLabels?.[String(v)] ?? String(v));
    const value = Array.isArray(raw) ? raw.map(show).join(", ") : show(raw);
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
