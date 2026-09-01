/**
 * Kategori adında görünebilecek karakterlerin TEK KAYNAĞI.
 *
 * İki yerde gerekiyor — çeviri üreticisinin sanitizer'ı ve kalite denetçisi —
 * ve ayrışırlarsa üretici bir çeviriyi yazar, denetçi onu "şüpheli" diye
 * düşürür (ya da tersi).
 *
 * KÜME TAHMİNLE DEĞİL ÖLÇÜMLE kuruldu: `ariba-categories.tsv`'deki 158.018
 * adın karakter envanteri çıkarıldı (2026-09-02). İlk elde yazdığım küme
 * Türkçe düzeltme işaretli harfleri (â/î/û) DIŞARIDA bırakıyordu — katalogda
 * 188 kez geçiyorlar ve "dâhil", "kâğıt" gibi geçerli yazımlar bu yüzden
 * sessizce reddedilecekti.
 *
 * Envanterde ayrıca yabancı sözcük kalıntıları (é ñ ë ó á) ve akıllı tırnak
 * (' ') var; tırnaklar ve sıfır-genişlikli boşluk (U+200B, kaynakta 2 kez)
 * ÇEVİRİDE normalize edilir — kaynak dosyaya dokunulmaz.
 */

/** Latin + Türkçe harfler, rakam ve katalogda ölçülen noktalama. */
export const CATEGORY_NAME_CHARS =
  /^[A-Za-zÀ-ÿĞğİıŞşÇçÖöÜü0-9\s\-.,:;()/%+&'"<>°ºµ#]+$/u;

/**
 * Model çıktısını yazmadan önce zararsızlaştırır:
 *  · sıfır-genişlikli karakterleri atar (görünmez, aramayı bozar)
 *  · akıllı tırnak/tireyi düz karşılığına indirger
 *  · boşlukları tekler
 */
export function normalizeName(raw: string): string {
  return (raw ?? "")
    .replace(/[​-‍﻿]/g, "")
    .replace(/[‘’ʼ]/g, "'")
    .replace(/[“”]/g, '"')
    .replace(/[–—]/g, "-")
    .replace(/\s+/g, " ")
    .trim();
}
