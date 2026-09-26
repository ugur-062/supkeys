import { resolveProvince } from "./tr-provinces";

/**
 * TÜRKİYE İLLERİNİN İNGİLİZCE VE RUSÇA ADLARI (i18n Faz 1e kapanışı, 2026-09-24).
 *
 * NEDEN VAR: `Company.city` serbest metin bir il adıdır ve herkese açık
 * sayfalarda başlık, açıklama, JSON-LD ve kartlarda geçer. İngilizce sayfada
 * "İstanbul" (noktalı İ) ve Rusça sayfada Latin "İzmir" görülüyordu; şehir
 * adları ülke adları gibi `Intl.DisplayNames`ten gelmez, elle yazılır.
 *
 * KURAL: İngilizce yazım İngilizce Vikipedi başlığıdır — yalnız Istanbul,
 * Izmir ve Hakkari aksan bırakır, kalanı Türkçe imlayla kalır (Tekirdağ,
 * Şanlıurfa). Rusça yazım Rusça Vikipedi başlığıdır (Kiril). Tanınmayan
 * metin (yabancı şehir, ilçe, boş) OLDUĞU GİBİ döner; Türkçede de ham metin
 * döner (kullanıcının yazdığı biçim korunur).
 *
 * Kaynak liste `TR_PROVINCES` (81 il); `tr-province-names.test` her ilin iki
 * dilde de karşılığı olduğunu ve Rusçanın Kiril olduğunu kilitler.
 */
export const TR_PROVINCE_NAMES_I18N: Readonly<Record<string, { readonly en: string; readonly ru: string }>> = {
  Adana: { en: "Adana", ru: "Адана" },
  Adıyaman: { en: "Adıyaman", ru: "Адыяман" },
  Afyonkarahisar: { en: "Afyonkarahisar", ru: "Афьонкарахисар" },
  Ağrı: { en: "Ağrı", ru: "Агры" },
  Amasya: { en: "Amasya", ru: "Амасья" },
  Ankara: { en: "Ankara", ru: "Анкара" },
  Antalya: { en: "Antalya", ru: "Анталья" },
  Artvin: { en: "Artvin", ru: "Артвин" },
  Aydın: { en: "Aydın", ru: "Айдын" },
  Balıkesir: { en: "Balıkesir", ru: "Балыкесир" },
  Bilecik: { en: "Bilecik", ru: "Биледжик" },
  Bingöl: { en: "Bingöl", ru: "Бингёль" },
  Bitlis: { en: "Bitlis", ru: "Битлис" },
  Bolu: { en: "Bolu", ru: "Болу" },
  Burdur: { en: "Burdur", ru: "Бурдур" },
  Bursa: { en: "Bursa", ru: "Бурса" },
  Çanakkale: { en: "Çanakkale", ru: "Чанаккале" },
  Çankırı: { en: "Çankırı", ru: "Чанкыры" },
  Çorum: { en: "Çorum", ru: "Чорум" },
  Denizli: { en: "Denizli", ru: "Денизли" },
  Diyarbakır: { en: "Diyarbakır", ru: "Диярбакыр" },
  Edirne: { en: "Edirne", ru: "Эдирне" },
  Elazığ: { en: "Elazığ", ru: "Элязыг" },
  Erzincan: { en: "Erzincan", ru: "Эрзинджан" },
  Erzurum: { en: "Erzurum", ru: "Эрзурум" },
  Eskişehir: { en: "Eskişehir", ru: "Эскишехир" },
  Gaziantep: { en: "Gaziantep", ru: "Газиантеп" },
  Giresun: { en: "Giresun", ru: "Гиресун" },
  Gümüşhane: { en: "Gümüşhane", ru: "Гюмюшхане" },
  Hakkâri: { en: "Hakkari", ru: "Хаккяри" },
  Hatay: { en: "Hatay", ru: "Хатай" },
  Isparta: { en: "Isparta", ru: "Ыспарта" },
  Mersin: { en: "Mersin", ru: "Мерсин" },
  İstanbul: { en: "Istanbul", ru: "Стамбул" },
  İzmir: { en: "Izmir", ru: "Измир" },
  Kars: { en: "Kars", ru: "Карс" },
  Kastamonu: { en: "Kastamonu", ru: "Кастамону" },
  Kayseri: { en: "Kayseri", ru: "Кайсери" },
  Kırklareli: { en: "Kırklareli", ru: "Кыркларели" },
  Kırşehir: { en: "Kırşehir", ru: "Кыршехир" },
  Kocaeli: { en: "Kocaeli", ru: "Коджаэли" },
  Konya: { en: "Konya", ru: "Конья" },
  Kütahya: { en: "Kütahya", ru: "Кютахья" },
  Malatya: { en: "Malatya", ru: "Малатья" },
  Manisa: { en: "Manisa", ru: "Маниса" },
  Kahramanmaraş: { en: "Kahramanmaraş", ru: "Кахраманмараш" },
  Mardin: { en: "Mardin", ru: "Мардин" },
  Muğla: { en: "Muğla", ru: "Мугла" },
  Muş: { en: "Muş", ru: "Муш" },
  Nevşehir: { en: "Nevşehir", ru: "Невшехир" },
  Niğde: { en: "Niğde", ru: "Нигде" },
  Ordu: { en: "Ordu", ru: "Орду" },
  Rize: { en: "Rize", ru: "Ризе" },
  Sakarya: { en: "Sakarya", ru: "Сакарья" },
  Samsun: { en: "Samsun", ru: "Самсун" },
  Siirt: { en: "Siirt", ru: "Сиирт" },
  Sinop: { en: "Sinop", ru: "Синоп" },
  Sivas: { en: "Sivas", ru: "Сивас" },
  Tekirdağ: { en: "Tekirdağ", ru: "Текирдаг" },
  Tokat: { en: "Tokat", ru: "Токат" },
  Trabzon: { en: "Trabzon", ru: "Трабзон" },
  Tunceli: { en: "Tunceli", ru: "Тунджели" },
  Şanlıurfa: { en: "Şanlıurfa", ru: "Шанлыурфа" },
  Uşak: { en: "Uşak", ru: "Ушак" },
  Van: { en: "Van", ru: "Ван" },
  Yozgat: { en: "Yozgat", ru: "Йозгат" },
  Zonguldak: { en: "Zonguldak", ru: "Зонгулдак" },
  Aksaray: { en: "Aksaray", ru: "Аксарай" },
  Bayburt: { en: "Bayburt", ru: "Байбурт" },
  Karaman: { en: "Karaman", ru: "Караман" },
  Kırıkkale: { en: "Kırıkkale", ru: "Кырыккале" },
  Batman: { en: "Batman", ru: "Батман" },
  Şırnak: { en: "Şırnak", ru: "Ширнак" },
  Bartın: { en: "Bartın", ru: "Бартын" },
  Ardahan: { en: "Ardahan", ru: "Ардахан" },
  Iğdır: { en: "Iğdır", ru: "Ыгдыр" },
  Yalova: { en: "Yalova", ru: "Ялова" },
  Karabük: { en: "Karabük", ru: "Карабюк" },
  Kilis: { en: "Kilis", ru: "Килис" },
  Osmaniye: { en: "Osmaniye", ru: "Османие" },
  Düzce: { en: "Düzce", ru: "Дюздже" },
};

/**
 * Serbest metin şehir → istenen dilde gösterim adı. Türkçede ve tanınmayan
 * metinde ham değer döner; `null`/boş için boş dize.
 */
export function provinceDisplayName(raw: string | null | undefined, locale: string): string {
  const v = (raw ?? "").trim();
  if (!v || locale === "tr") return v;
  const p = resolveProvince(v);
  if (!p) return v;
  const names = TR_PROVINCE_NAMES_I18N[p.name];
  if (!names) return v;
  return locale === "ru" ? names.ru : locale === "en" ? names.en : v;
}
