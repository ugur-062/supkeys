/**
 * SEED KATEGORİ KAPISI — demo/seed betikleri GİZLİ segmente yazamaz (2026-10-09).
 *
 * Kural (kullanıcı): "anasayfada olmayan kategori talepte, üründe ya da başka
 * yerde de gösterilmesin". Uygulama yolu bunu doğrulama kapılarıyla tutuyor
 * (`validateListingBusinessRules`, `validateCategorySelection`); seed betikleri
 * ise Prisma ile DOĞRUDAN yazar, hiçbir kapıdan geçmez. Denetimde gizli
 * segmentteki QA dışı kayıtların kaynağı tam da buydu: `seed-marketplace-demo`
 * (8 firma, 13 ürün, 2 talep) ve `seed-staging-demo` (ücretsiz demo firmanın
 * tamamı).
 *
 * İKİ HAT, tek kaynak `@rothern/shared` `HIDDEN_SEGMENTS`:
 *   1. `assertVisibleSeedCategories` — betik HİÇBİR şey yazmadan önce elindeki
 *      bütün kodları denetler, gizli varsa DURUR (fail-loud, `assertAttrs` yanı).
 *      Demo GÖRSELLERİ de aynı listeye girer (`seedPhotoCategoryRefs`): gizli
 *      segmentin fotoğrafı da o kategoriyi gösterir.
 *   2. Katalog sorguları `hiddenCategoryWhere()` taşır — anahtar kelime yedeği
 *      ("masa" → 42192000, "gümrük" → 93171700) gizli segmente DÜŞEMEZ; çözülen
 *      kod yazılmadan önce bir kez daha denetlenir.
 *
 * Prisma'ya bağımlı DEĞİL: sorgu `FindSeedCategory` adaptörüyle enjekte edilir
 * (betik gerçek istemciyi, test kendi istemcisini verir).
 * Sözleşme: API `test/unit/seed-category-guard.spec.ts`,
 * `test/integration/seed-scripts-hidden-category.spec.ts`.
 */
import { hiddenCategoryWhere, isHiddenCategory, type HiddenCategoryWhere } from "@rothern/shared";

export interface SeedCategoryRef {
  /** Kodun betikteki yeri (hata iletisinde basılır), ör. `company marmara sell`. */
  source: string;
  code: string;
}

/** Gizli segmentin altındaki başvurular (sıra korunur). */
export function hiddenSeedCategoryRefs(refs: readonly SeedCategoryRef[]): SeedCategoryRef[] {
  return refs.filter((r) => isHiddenCategory(r.code));
}

/** Fail-loud: tek bir gizli kod bile varsa betik durur, hiçbir şey yazılmaz. */
export function assertVisibleSeedCategories(script: string, refs: readonly SeedCategoryRef[]): void {
  const hidden = hiddenSeedCategoryRefs(refs);
  if (hidden.length === 0) return;
  throw new Error(
    `[${script}] ${hidden.length} seed category code(s) sit under a hidden segment (HIDDEN_SEGMENTS). ` +
      `A seed must never write a hidden-segment category; move them to a visible segment:\n  ` +
      hidden.map((r) => `${r.code}  ${r.source}`).join("\n  "),
  );
}

/** Tek kod için aynı kapı; görünürse kodu geri verir (yazımdan hemen önce sarmalamak için). */
export function assertVisibleSeedCategory(script: string, source: string, code: string): string {
  assertVisibleSeedCategories(script, [{ source, code }]);
  return code;
}

/** Betikteki bir görselin yeri (hata iletisinde basılır) ve yolu. */
export interface SeedPhoto {
  source: string;
  src: string;
}

/**
 * DEMO GÖRSELİ DE KAPIDAN GEÇER. Demo ürün görseli ve firma kapağı repodaki
 * kategori fotoğrafıdır (`/categories/<segment kodu>.webp`). Gizli segmentin
 * fotoğrafı, adını yazmadan o kategoriyi göstermek olur: web aynı gerekçeyle
 * gizli segmentin fotoğrafını hiçbir yüzeyde vermez (`category-photos.ts`
 * `categoryPhotoSrc`), ama kayda YAZILMIŞ görsel yolu o süzgeçten geçmez.
 *
 * Yolu, koduyla birlikte kapı başvurusuna çevirir; betik bunları kategori
 * kodlarıyla AYNI `assertVisibleSeedCategories` çağrısına verir. Kategori
 * fotoğrafı olmayan yol (yüklenmiş görsel, dış adres) başvuru üretmez.
 */
export function seedPhotoCategoryRefs(photos: readonly SeedPhoto[]): SeedCategoryRef[] {
  return photos.flatMap(({ source, src }) => {
    const code = /\/categories\/(\d{8})\.webp$/.exec(src)?.[1];
    return code ? [{ source: `${source} image ${src}`, code }] : [];
  });
}

/** Seed betiklerinin katalog sorgusu — her zaman gizli segment süzgeciyle. */
export type SeedCategoryWhere = {
  id?: string | { startsWith: string };
  level?: number | { gte: number };
  inDiscovery?: true;
  nameTr?: { contains: string; mode: "insensitive" };
} & HiddenCategoryWhere;

/** `where`e uyan İLK kategori (kod sırasıyla); betik Prisma'yı, test kendi istemcisini bağlar. */
export type FindSeedCategory = (where: SeedCategoryWhere) => Promise<{ id: string } | null>;

/**
 * Ürün/talep kategorisi: kod geçerli (discovery, L3+) ise o; değilse anahtar
 * kelimeyle önce kodun segmentinde, sonra TÜM GÖRÜNÜR katalogda en yakın L3;
 * o da yoksa kodun segmentindeki ilk L3. Gizli kod verilirse ya da sonuç gizli
 * çıkarsa DURUR — sessizce başka bir kategoriye düşmek yok.
 */
export async function resolveVisibleDiscoveryCategory(
  find: FindSeedCategory,
  script: string,
  code: string,
  kw?: string,
): Promise<string> {
  assertVisibleSeedCategory(script, "resolveVisibleDiscoveryCategory input", code);
  const visible = hiddenCategoryWhere();
  const segment = { startsWith: code.slice(0, 2) };
  let found = await find({ id: code, inDiscovery: true, level: { gte: 3 }, ...visible });
  if (!found && kw) {
    const byName = { contains: kw, mode: "insensitive" as const };
    found =
      (await find({ inDiscovery: true, level: 3, id: segment, nameTr: byName, ...visible })) ??
      (await find({ inDiscovery: true, level: 3, nameTr: byName, ...visible }));
  }
  if (!found) found = await find({ inDiscovery: true, level: 3, id: segment, ...visible });
  if (!found) throw new Error(`[${script}] category could not be resolved: ${code} (${kw ?? "-"})`);
  return assertVisibleSeedCategory(script, `resolved from ${code}`, found.id);
}

/** Kodun segmenti (L1) katalogda varsa o, yoksa null. Gizli kod → DURUR. */
export async function visibleSegmentOf(find: FindSeedCategory, script: string, code: string): Promise<string | null> {
  assertVisibleSeedCategory(script, "visibleSegmentOf input", code);
  const seg = `${code.slice(0, 2)}000000`;
  return (await find({ id: seg, ...hiddenCategoryWhere() })) ? seg : null;
}

/** Firma seçim kodu katalogda varsa o; yoksa segmentine düşer (beyan boş kalmasın). Gizli kod → DURUR. */
export async function existingVisiblePick(find: FindSeedCategory, script: string, code: string): Promise<string | null> {
  assertVisibleSeedCategory(script, "existingVisiblePick input", code);
  if (await find({ id: code, ...hiddenCategoryWhere() })) return code;
  return visibleSegmentOf(find, script, code);
}

/**
 * "Herhangi bir aktif aile (L2)" seçen eski demo betikleri için `where`
 * (`seed-demo-fill`, `add-anadolu-listing`). Süzgeçsiz ve sırasız hâliyle
 * katalogdaki ilk 24 ailenin TAMAMI segment 10'du (canlı bitki/hayvan).
 */
export function visibleActiveFamilyWhere(): { level: 2; isActive: true } & HiddenCategoryWhere {
  return { level: 2, isActive: true, ...hiddenCategoryWhere() };
}
