import { LOCALE_LABELS, type Locale } from "@rothern/i18n";

/**
 * AI ÇIKTI DİLİ — tek kaynak (2026-09-27 uluslararası denetim).
 *
 * Kayıt tüm ülkelere açıldı; kullanıcı arayüzü tr/en/ru, İÇERİĞİ ise herhangi
 * bir dilde yazabilir (Almanca kalem, Çince açıklama). Eskiden AI istemlerinin
 * çoğu "Türkçe yaz" diyordu → Almanca kalemlerden Türkçe başlık, Türkçe
 * anahtar kelime, Türkçe tanıtım çıkıyordu. Bu hem kullanıcıyı şaşırtıyor hem
 * de KARIŞIK DİLLİ kayıt üretiyordu: kaynak dili "de" saptanan bir talebin
 * Türkçe açıklaması Türkçe hedefe "kaynağın aynısı" diye düşüyor, çeviri
 * FAILED'e gidiyor ve kayıt HİÇBİR dilde indekslenmiyordu.
 *
 * İki kural:
 *  - İÇERİK alanları (başlık, açıklama, anahtar kelime, kalem adı) GİRDİNİN
 *    dilinde kalır — kayıt tek dilli olsun, çeviri katmanı diğer dilleri
 *    üretsin. Girdi yoksa/karışıksa arayüz dili.
 *  - ARAYÜZ alanları (özet, gerekçe, eksik bilgi etiketi, uyarı) kullanıcının
 *    arayüz dilinde (`currentLocale()`).
 *
 * İstem gövdeleri Türkçe KALIR (model talimatı, katalog değil); kural satırı
 * istemin EN SONUNA eklenir — en yakın talimat (asistanla aynı kalıp).
 */

/** "English (en)" — model dil kodundan tahmin etmesin, ad açıkça yazılır. */
export function aiLanguageName(locale: Locale): string {
  return `${LOCALE_LABELS[locale]} (${locale})`;
}

/**
 * İçerik alanları girdinin dilinde. `fields` kuralın kapsadığı alanları
 * modele adıyla söyler ("title, keywords").
 */
export function aiContentLanguageRule(locale: Locale, fields: string): string {
  return `ÇIKTI DİLİ (${fields}): Girdideki metin (kalemler/belge/ad/açıklama) hangi dilde yazılmışsa O DİLDE yaz — ÇEVİRME. Girdi birden çok dil karıştırıyorsa ya da metin yoksa şu dili kullan: ${aiLanguageName(locale)}. Marka, model, standart ve parça kodları (ör. M6, CF226A, DN50) aynen korunur.`;
}

/** Kullanıcıya gösterilen açıklama/özet alanları arayüz dilinde. */
export function aiUiLanguageRule(locale: Locale, fields: string): string {
  return `KULLANICI METNİ DİLİ (${fields}): Bu alanları DAİMA şu dilde yaz: ${aiLanguageName(locale)} — girdi başka dilde olsa bile.`;
}
