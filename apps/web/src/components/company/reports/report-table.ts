/**
 * Rapor tablolarının ORTAK yerleşim sınıfları (mobil denetim g10-01/03/04/06,
 * 2026-10-15). Kullanıcı kararı: rapor/analiz tabloları yatay kaydırmayı
 * KORUR; ilk sütun yapışkan kalır ama telefonda DAR ve SARAN olur ki öteki
 * sütunlar görünsün. Eskiden Catalyst tablosunun `whitespace-nowrap`ı yüzünden
 * yapışkan ilk sütun en uzun başlık kadar (517 px) genişliyor, 344 px'lik
 * kaydırıcının tamamını örtüyordu — hiçbir kaydırma konumunda Durum, Teklif,
 * Kazanan… görünmüyordu.
 *
 * Kart sarmalayıcı kuralı (g10-06): `card overflow-hidden px-2
 * [--gutter:--spacing(2)]` — kenar payı tablonun `--gutter`ına EŞİT, tek yatay
 * kaydırıcı tablonun kendisi (kart `overflow-x-auto` olunca ikinci bir 8 px'lik
 * kaydırıcı oluyordu). sm+ görünüm aynı: tablonun içeriği yine kartın
 * dolgusunda başlar.
 */

/** Yapışkan ilk hücre (başlık ve gövde). Zemin beyaz: kayan hücreler altından geçer. */
export const REPORT_STICKY_CELL = "sticky left-0 z-10 bg-white";

/** Yapışkan başlık hücresi telefonda sarar — sütun genişliğini gövde belirler. */
export const REPORT_STICKY_HEADER = "max-sm:whitespace-normal";

/**
 * İlk sütunun içeriği: telefonda görüntü alanının %36'sı ile %45'i arası ve
 * SARAR (yalnız sığmayan tek sözcük bölünür); sm ve üstü eskisi gibi tek
 * satır, genişlik içerikten. Genişlik hücreye değil içteki kutuya verilir —
 * tablo hücresinde `min/max-width` tarayıcıdan tarayıcıya güvenilmez.
 *
 * ALT SINIR ŞART (doğrulama turu g10): Catalyst tablosu `inline-block
 * min-w-full` sarmalayıcıda; tablo kaydırıcıdan genişken sarmalayıcının
 * sığdırma genişliği min-content'e iner, otomatik tablo düzeni de saran
 * sütuna yalnız EN UZUN SÖZCÜĞÜ kadar yer verir (360 px'te 48 px'lik kutu:
 * "RV-" / "B06 L2" / "rulman" / "ve"… 11 satır). `min-w` kutunun min-content
 * katkısını sabitler; numara/tarih gibi bölünmemesi gereken parçalar ayrıca
 * `whitespace-nowrap` taşır.
 */
export const REPORT_FIRST_COL =
  "min-w-[36vw] max-w-[45vw] whitespace-normal wrap-break-word sm:min-w-0 sm:max-w-none sm:whitespace-nowrap";

/**
 * Yanında 44 px'lik satır açıcısı duran ilk sütun (tasarruf raporu): metin
 * kutusu telefonda %28–%36 arasında kalır ki hücrenin tamamı (dolgu + açıcı +
 * metin) yine görüntü alanının ~%52'sini geçmesin, öteki sütunlar görünsün.
 * Alt sınırın gerekçesi `REPORT_FIRST_COL` ile aynı.
 */
export const REPORT_FIRST_COL_WITH_TOGGLE =
  "min-w-[28vw] max-w-[36vw] whitespace-normal wrap-break-word sm:min-w-0 sm:max-w-none sm:whitespace-nowrap";

/**
 * Özet şeridinde tek sayıda kalan son kutu telefonda iki sütuna yayılır
 * (2 sütunlu ızgarada boş gri kutu kalmasın — g10-04). sm ve üstü değişmez.
 */
export function summaryTileSpan(index: number, count: number): string {
  return index === count - 1 && count % 2 === 1 ? "max-sm:col-span-2" : "";
}
