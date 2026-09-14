import { categoryAncestors, categoryLevel, isCategoryCode } from "./category-code";

/**
 * FİRMA KATEGORİ BEYANI — SEÇİM ↔ DEPOLAMA DÖNÜŞÜMÜ. TEK KAYNAK.
 *
 * SORUN (2026-09-14'te ölçüldü): eşleştirme ata zincirini **talebin** kodundan
 * YUKARI çıkarıyor (`deriveCategoryMatchCandidates` → `categoryAncestors`),
 * firmanın beyanından AŞAĞI inen bir yol yok. Talepler ise en az L3. Sonuç:
 *
 *   firma `39121614` (yaprak) beyan eder · alıcı `39121600` (sınıf) talebi açar
 *   → dar eksen TUTMAZ → geniş eksene (`39000000` Elektrik) düşer
 *   → firmaya TÜM elektrik talepleri gider.
 *
 * Kullanıcı daralttığını sanırken genişletiyor. En kötü arıza türü: sessiz ve
 * tam ters yönde.
 *
 * ÇÖZÜM (kullanıcı kararı): yaprak seçilebilir KALSIN, ama seçildiğinde ata
 * zinciri de beyana dahil olsun. Yani seçim L4'te, depolama L2+L3+L4'te,
 * segment ayrı eksende (L1). Böylece alıcı hangi seviyede talep açarsa açsın
 * dar eksen tutar.
 *
 * İKİ SAYIM AYRI TUTULUR:
 *  · `MAX_COMPANY_SUB_PICKS` — kullanıcının GÖRDÜĞÜ tavan (kaç şey seçti).
 *  · `MAX_COMPANY_SUB_CATEGORIES` — DEPOLANAN tavan (zincir genişlemesi dahil).
 * Tek sayı kullanılsaydı, 50 yaprak seçen kullanıcı genişlemeyle tavanı aşıp
 * anlamsız bir hata alırdı.
 */

/** Kullanıcının seçebileceği en fazla ürün/hizmet sayısı (zincir hariç). */
export const MAX_COMPANY_SUB_PICKS = 50;

/**
 * Bir seçim kümesini depolanacak hâle çevirir: segmentler ana eksene, ata
 * zincirinin geri kalanı (L2/L3/L4) alt eksene.
 *
 * `mevcutMain` — kullanıcının "Sektör geneli" ile eklediği, altında yaprağı
 * olmayan segmentler kaybolmasın diye korunur.
 */
export function expandCompanyCategorySelection(
  picks: readonly string[],
  mevcutMain: readonly string[] = [],
): { mainIds: string[]; subIds: string[] } {
  const main = new Set(mevcutMain.filter(isCategoryCode));
  const sub = new Set<string>();
  for (const code of picks) {
    if (!isCategoryCode(code)) continue;
    for (const ata of categoryAncestors(code)) {
      if (categoryLevel(ata) === 1) main.add(ata);
      else sub.add(ata);
    }
  }
  return { mainIds: [...main], subIds: [...sub] };
}

/**
 * Depolanan kümeden KULLANICININ SEÇTİKLERİNİ geri çıkarır: başka bir kaydın
 * atası olmayan, yani en derindeki kodlar.
 *
 * Gösterim bunu kullanır — türetilmiş L2/L3 ayrı çip olarak çizilseydi tek
 * seçim üç çipe dönüşür, 50'lik tavan da anlamsızlaşırdı. Kullanıcı seçtiği
 * şeyi görür; zincir, çipin breadcrumb'ında zaten okunuyor.
 *
 * TEK KAYIP (bilinçli): kullanıcı hem `39120000`'ı hem altındaki bir yaprağı
 * AYRI AYRI seçerse, gösterimde yalnız yaprak kalır. Beyan kaybolmaz —
 * `39120000` depoda durur ve eşleşmeye aynen katılır; yalnız iki kere
 * çizilmez. Bu hâli üst üste binen çift kayıttan daha az yanıltıcı.
 */
export function deepestCategoryPicks(subIds: readonly string[]): string[] {
  const kod = subIds.filter(isCategoryCode);
  const atalar = new Set<string>();
  for (const c of kod) {
    for (const a of categoryAncestors(c)) if (a !== c) atalar.add(a);
  }
  return kod.filter((c) => !atalar.has(c));
}

/** Bir kodu ve altındaki her şeyi beyandan çıkarır (zincirleme silme). */
export function removeCategoryBranch(
  subIds: readonly string[],
  code: string,
): string[] {
  return subIds.filter(
    (id) => id !== code && !categoryAncestors(id).includes(code),
  );
}
