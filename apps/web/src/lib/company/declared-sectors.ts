import { categorySegment, isCategoryCode, visibleCompanyCategorySelection } from "@rothern/shared";

/**
 * FİRMA KATEGORİ BEYANI = YALNIZ SEKTÖR (sahip kararı 2026-10-29, S1/S2).
 *
 * Kayıt 2. adımı ("Faaliyet alanı") ve Ayarlar › Firma Bilgileri ›
 * Kategoriler ("Ne alırım / Ne satarım") artık yalnız sektör (L1) sorar, eksen
 * başına en fazla `MAX_COMPANY_MAIN_CATEGORIES`. Ürün / hizmet (L2-L4) seçimi
 * o pencerede yok; mevcut firmaların alt seçimleri ayrı bir temizlik
 * betiğiyle silinir ve API yeni alt seçim saklamaz.
 *
 * Bu modül, depodaki (ya da eski bir taslaktaki) iki diziyi EKRANDA
 * gösterilecek sektör listesine indirir — seçici, kayıt özeti ve Profilim aynı
 * listeyi okur:
 *  · Önce GÖRÜNÜR kısım alınır (`visibleCompanyCategorySelection`, eksenin iki
 *    dizisi birlikte): gizli kodlar ve YALNIZ gizli bir seçimin atası olarak
 *    saklanmış sektör düşer.
 *  · Ana eksendeki her kod kendi sektörüne yuvarlanır (eski hatalı kayıtta ana
 *    eksende L2+ kod olabilir); ardından alt eksendeki eski seçimlerin
 *    sektörleri eklenir — API de alt seçimi sektörüne normalize ettiği için
 *    (sektör ana eksene eklenir) firma o sektörde zaten beyanlıdır.
 *  · Sıra kayıtlı sıradır (önce ana eksen, sonra alt seçimlerden gelen yeni
 *    sektörler); tekrar yok.
 *
 * Katalog kodu OLMAYAN değer (yalnız testlerde) ana eksende olduğu gibi kalır,
 * alt eksende yok sayılır.
 */
export function declaredSectors(
  mainIds: readonly (string | null | undefined)[] | null | undefined,
  subIds: readonly (string | null | undefined)[] | null | undefined,
): string[] {
  const visible = visibleCompanyCategorySelection(mainIds, subIds);
  const out = new Set<string>();
  for (const id of visible.mainIds) out.add(categorySegment(id) ?? id);
  for (const id of visible.subIds) {
    const sector = categorySegment(id);
    if (sector) out.add(sector);
  }
  return [...out];
}

/**
 * Bir seçim kümesinin sektörleri — kategori penceresinden dönen küme (sektör
 * kipinde yalnız sektör kodlarıdır; başka kod gelirse sektörüne yuvarlanır).
 * Sıra korunur, tekrar yok; katalog kodu olmayan değer olduğu gibi kalır.
 */
export function sectorsOf(ids: readonly string[]): string[] {
  const out = new Set<string>();
  for (const id of ids) out.add(isCategoryCode(id) ? (categorySegment(id) ?? id) : id);
  return [...out];
}
