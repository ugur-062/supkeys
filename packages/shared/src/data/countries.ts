/**
 * ÜLKE TABLOSU — ISO 3166-1 alpha-2 kodu + Türkçe ad + telefon kodu.
 *
 * TAM LİSTE (2026-09-27, kullanıcı: "tüm ülkeler kayıt olabilsin"): eskiden 98
 * ülkeydi ve `isValidCountryCode` DOĞRULAYICI olarak kullanıldığı için listede
 * olmayan ülke kayıt/adres/talep hedefi olamıyor, telefonu girilemiyor, Türkçe
 * arayüzde adı yerine kodu görünüyordu. Şimdi tüm yerleşik ülke ve bölgeler
 * (insansız AQ/BV/HM/TF/UM/GS hariç) + iki kullanıcıya ayrılmış kod:
 * `XK` Kosova (yaygın kullanım) ve `XN` KKTC (ISO'da YOK — dış sistemlere
 * gönderilmez, bayrağı çizilmez).
 *
 * VERİ STATİK, bilinçli: ad `Intl.DisplayNames`ten türetilseydi sunucu (Node
 * ICU) ile tarayıcı farklı ad basıp hidrasyon uyuşmazlığı üretebilirdi. EN/RU
 * adları gösterimde `Intl` ile gelir (`countryDisplayName`); Türkçe ad buradan.
 *
 * Telefon kodu: NANP ada ülkeleri kendi alan koduyla (1268, 1787…) — "+1" tek
 * başına ABD/Kanada; ortak kodlarda ayrıştırıcı birincil ülkeyi seçer
 * (`phone-codes.ts`). Sıra: TR başta, sonra Türkçe alfabe.
 *
 * Kayıt kapısı BURADA DEĞİL (`country-profiles.ts` `REGISTRATION_BLOCKED`):
 * bu liste adres, talep hedefi ve mevcut kayıtların gösterimi için TAMDIR.
 */
export interface Country {
  /** ISO 3166-1 alpha-2 (ör. "TR", "DE") ya da XK/XN. */
  code: string;
  /** Türkçe ülke adı. */
  name: string;
}

/** [kod, Türkçe ad, telefon kodu (+ olmadan)] */
export const COUNTRY_TABLE: readonly (readonly [string, string, string])[] = [
  ["TR", "Türkiye", "90"],
  ["VI", "ABD Virjin Adaları", "1340"],
  ["AF", "Afganistan", "93"],
  ["DE", "Almanya", "49"],
  ["US", "Amerika Birleşik Devletleri", "1"],
  ["AS", "Amerikan Samoası", "1684"],
  ["AD", "Andorra", "376"],
  ["AO", "Angola", "244"],
  ["AI", "Anguilla", "1264"],
  ["AG", "Antigua ve Barbuda", "1268"],
  ["AR", "Arjantin", "54"],
  ["AL", "Arnavutluk", "355"],
  ["AW", "Aruba", "297"],
  ["AU", "Avustralya", "61"],
  ["AT", "Avusturya", "43"],
  ["AZ", "Azerbaycan", "994"],
  ["BS", "Bahamalar", "1242"],
  ["BH", "Bahreyn", "973"],
  ["BD", "Bangladeş", "880"],
  ["BB", "Barbados", "1246"],
  ["EH", "Batı Sahra", "212"],
  ["BY", "Belarus", "375"],
  ["BE", "Belçika", "32"],
  ["BZ", "Belize", "501"],
  ["BJ", "Benin", "229"],
  ["BM", "Bermuda", "1441"],
  ["AE", "Birleşik Arap Emirlikleri", "971"],
  ["GB", "Birleşik Krallık", "44"],
  ["BO", "Bolivya", "591"],
  ["BA", "Bosna-Hersek", "387"],
  ["BW", "Botsvana", "267"],
  ["BR", "Brezilya", "55"],
  ["IO", "Britanya Hint Okyanusu Toprakları", "246"],
  ["VG", "Britanya Virjin Adaları", "1284"],
  ["BN", "Brunei", "673"],
  ["BG", "Bulgaristan", "359"],
  ["BF", "Burkina Faso", "226"],
  ["BI", "Burundi", "257"],
  ["BT", "Butan", "975"],
  ["KY", "Cayman Adaları", "1345"],
  ["GI", "Cebelitarık", "350"],
  ["DZ", "Cezayir", "213"],
  ["CX", "Christmas Adası", "61"],
  ["DJ", "Cibuti", "253"],
  ["CC", "Cocos (Keeling) Adaları", "61"],
  ["CK", "Cook Adaları", "682"],
  ["CW", "Curaçao", "599"],
  ["TD", "Çad", "235"],
  ["CZ", "Çekya", "420"],
  ["CN", "Çin", "86"],
  ["DK", "Danimarka", "45"],
  ["TL", "Doğu Timor", "670"],
  ["DO", "Dominik Cumhuriyeti", "1809"],
  ["DM", "Dominika", "1767"],
  ["EC", "Ekvador", "593"],
  ["GQ", "Ekvator Ginesi", "240"],
  ["SV", "El Salvador", "503"],
  ["ID", "Endonezya", "62"],
  ["ER", "Eritre", "291"],
  ["AM", "Ermenistan", "374"],
  ["EE", "Estonya", "372"],
  ["SZ", "Esvatini", "268"],
  ["ET", "Etiyopya", "251"],
  ["FK", "Falkland Adaları", "500"],
  ["FO", "Faroe Adaları", "298"],
  ["MA", "Fas", "212"],
  ["FJ", "Fiji", "679"],
  ["CI", "Fildişi Sahili", "225"],
  ["PH", "Filipinler", "63"],
  ["PS", "Filistin", "970"],
  ["FI", "Finlandiya", "358"],
  ["FR", "Fransa", "33"],
  ["GF", "Fransız Guyanası", "594"],
  ["PF", "Fransız Polinezyası", "689"],
  ["GA", "Gabon", "241"],
  ["GM", "Gambiya", "220"],
  ["GH", "Gana", "233"],
  ["GN", "Gine", "224"],
  ["GW", "Gine-Bissau", "245"],
  ["GD", "Grenada", "1473"],
  ["GL", "Grönland", "299"],
  ["GP", "Guadeloupe", "590"],
  ["GU", "Guam", "1671"],
  ["GT", "Guatemala", "502"],
  ["GG", "Guernsey", "44"],
  ["GY", "Guyana", "592"],
  ["ZA", "Güney Afrika", "27"],
  ["KR", "Güney Kore", "82"],
  ["SS", "Güney Sudan", "211"],
  ["GE", "Gürcistan", "995"],
  ["HT", "Haiti", "509"],
  ["HR", "Hırvatistan", "385"],
  ["IN", "Hindistan", "91"],
  ["NL", "Hollanda", "31"],
  ["HN", "Honduras", "504"],
  ["HK", "Hong Kong", "852"],
  ["IQ", "Irak", "964"],
  ["IR", "İran", "98"],
  ["IE", "İrlanda", "353"],
  ["ES", "İspanya", "34"],
  ["IL", "İsrail", "972"],
  ["SE", "İsveç", "46"],
  ["CH", "İsviçre", "41"],
  ["IT", "İtalya", "39"],
  ["IS", "İzlanda", "354"],
  ["JM", "Jamaika", "1876"],
  ["JP", "Japonya", "81"],
  ["JE", "Jersey", "44"],
  ["KH", "Kamboçya", "855"],
  ["CM", "Kamerun", "237"],
  ["CA", "Kanada", "1"],
  ["ME", "Karadağ", "382"],
  ["BQ", "Karayip Hollandası", "599"],
  ["QA", "Katar", "974"],
  ["KZ", "Kazakistan", "7"],
  ["KE", "Kenya", "254"],
  ["CY", "Kıbrıs", "357"],
  ["KG", "Kırgızistan", "996"],
  ["KI", "Kiribati", "686"],
  ["CO", "Kolombiya", "57"],
  ["KM", "Komorlar", "269"],
  ["CG", "Kongo Cumhuriyeti", "242"],
  ["CD", "Kongo Demokratik Cumhuriyeti", "243"],
  ["XK", "Kosova", "383"],
  ["CR", "Kosta Rika", "506"],
  ["KW", "Kuveyt", "965"],
  ["XN", "Kuzey Kıbrıs Türk Cumhuriyeti", "90"],
  ["KP", "Kuzey Kore", "850"],
  ["MK", "Kuzey Makedonya", "389"],
  ["MP", "Kuzey Mariana Adaları", "1670"],
  ["CU", "Küba", "53"],
  ["LA", "Laos", "856"],
  ["LS", "Lesotho", "266"],
  ["LV", "Letonya", "371"],
  ["LR", "Liberya", "231"],
  ["LY", "Libya", "218"],
  ["LI", "Lihtenştayn", "423"],
  ["LT", "Litvanya", "370"],
  ["LB", "Lübnan", "961"],
  ["LU", "Lüksemburg", "352"],
  ["HU", "Macaristan", "36"],
  ["MG", "Madagaskar", "261"],
  ["MO", "Makao", "853"],
  ["MW", "Malavi", "265"],
  ["MV", "Maldivler", "960"],
  ["MY", "Malezya", "60"],
  ["ML", "Mali", "223"],
  ["MT", "Malta", "356"],
  ["IM", "Man Adası", "44"],
  ["MH", "Marshall Adaları", "692"],
  ["MQ", "Martinik", "596"],
  ["MU", "Mauritius", "230"],
  ["YT", "Mayotte", "262"],
  ["MX", "Meksika", "52"],
  ["EG", "Mısır", "20"],
  ["FM", "Mikronezya", "691"],
  ["MN", "Moğolistan", "976"],
  ["MD", "Moldova", "373"],
  ["MC", "Monako", "377"],
  ["MS", "Montserrat", "1664"],
  ["MR", "Moritanya", "222"],
  ["MZ", "Mozambik", "258"],
  ["MM", "Myanmar", "95"],
  ["NA", "Namibya", "264"],
  ["NR", "Nauru", "674"],
  ["NP", "Nepal", "977"],
  ["NE", "Nijer", "227"],
  ["NG", "Nijerya", "234"],
  ["NI", "Nikaragua", "505"],
  ["NU", "Niue", "683"],
  ["NF", "Norfolk Adası", "672"],
  ["NO", "Norveç", "47"],
  ["CF", "Orta Afrika Cumhuriyeti", "236"],
  ["UZ", "Özbekistan", "998"],
  ["PK", "Pakistan", "92"],
  ["PW", "Palau", "680"],
  ["PA", "Panama", "507"],
  ["PG", "Papua Yeni Gine", "675"],
  ["PY", "Paraguay", "595"],
  ["PE", "Peru", "51"],
  ["PN", "Pitcairn Adaları", "64"],
  ["PL", "Polonya", "48"],
  ["PT", "Portekiz", "351"],
  ["PR", "Porto Riko", "1787"],
  ["RO", "Romanya", "40"],
  ["RW", "Ruanda", "250"],
  ["RU", "Rusya", "7"],
  ["RE", "Réunion", "262"],
  ["BL", "Saint Barthélemy", "590"],
  ["SH", "Saint Helena", "290"],
  ["KN", "Saint Kitts ve Nevis", "1869"],
  ["LC", "Saint Lucia", "1758"],
  ["MF", "Saint Martin", "590"],
  ["PM", "Saint Pierre ve Miquelon", "508"],
  ["VC", "Saint Vincent ve Grenadinler", "1784"],
  ["WS", "Samoa", "685"],
  ["SM", "San Marino", "378"],
  ["ST", "São Tomé ve Príncipe", "239"],
  ["SN", "Senegal", "221"],
  ["SC", "Seyşeller", "248"],
  ["RS", "Sırbistan", "381"],
  ["SL", "Sierra Leone", "232"],
  ["SG", "Singapur", "65"],
  ["SX", "Sint Maarten", "1721"],
  ["SK", "Slovakya", "421"],
  ["SI", "Slovenya", "386"],
  ["SB", "Solomon Adaları", "677"],
  ["SO", "Somali", "252"],
  ["LK", "Sri Lanka", "94"],
  ["SD", "Sudan", "249"],
  ["SR", "Surinam", "597"],
  ["SY", "Suriye", "963"],
  ["SA", "Suudi Arabistan", "966"],
  ["SJ", "Svalbard ve Jan Mayen", "47"],
  ["CL", "Şili", "56"],
  ["TJ", "Tacikistan", "992"],
  ["TZ", "Tanzanya", "255"],
  ["TH", "Tayland", "66"],
  ["TW", "Tayvan", "886"],
  ["TG", "Togo", "228"],
  ["TK", "Tokelau", "690"],
  ["TO", "Tonga", "676"],
  ["TT", "Trinidad ve Tobago", "1868"],
  ["TN", "Tunus", "216"],
  ["TC", "Turks ve Caicos Adaları", "1649"],
  ["TV", "Tuvalu", "688"],
  ["TM", "Türkmenistan", "993"],
  ["UG", "Uganda", "256"],
  ["UA", "Ukrayna", "380"],
  ["OM", "Umman", "968"],
  ["UY", "Uruguay", "598"],
  ["JO", "Ürdün", "962"],
  ["VU", "Vanuatu", "678"],
  ["VA", "Vatikan", "39"],
  ["VE", "Venezuela", "58"],
  ["VN", "Vietnam", "84"],
  ["WF", "Wallis ve Futuna", "681"],
  ["YE", "Yemen", "967"],
  ["NC", "Yeni Kaledonya", "687"],
  ["NZ", "Yeni Zelanda", "64"],
  ["CV", "Yeşil Burun Adaları", "238"],
  ["GR", "Yunanistan", "30"],
  ["ZM", "Zambiya", "260"],
  ["ZW", "Zimbabve", "263"],
  ["AX", "Åland Adaları", "358"],
];

export const COUNTRIES: readonly Country[] = COUNTRY_TABLE.map(([code, name]) => ({ code, name }));

const COUNTRY_CODES = new Set(COUNTRIES.map((c) => c.code));

/** Geçerli bir ülke kodu mu (listede var mı). */
export function isValidCountryCode(code: string): boolean {
  return COUNTRY_CODES.has(code);
}

/** Ülke kodundan Türkçe adı; bulunamazsa kodu döner. */
export function countryName(code: string): string {
  return COUNTRIES.find((c) => c.code === code)?.name ?? code;
}

/** Türkiye mi (TR-özgü doğrulama/adres mantığı için). */
export function isTurkey(code: string | null | undefined): boolean {
  return (code ?? "TR") === "TR";
}

/**
 * Ülke kodundan BAYRAK emojisi — kart ve dizin satırlarında ad okunmadan
 * ülke ayırt edilsin diye (Europages kalıbı).
 *
 * Emoji, iki harfin "bölgesel gösterge" karşılığından türetilir; ayrı bir
 * görsel varlığı ya da kütüphanesi YOK.
 *
 * ⚠️ KKTC (`XN`) ISO 3166-1'de OLMAYAN, kullanıcıya ayrılmış bir koddur:
 * bölgesel gösterge çifti geçerli bir bayrağa çözülmez, tarayıcıya göre iki
 * harf kutusu ya da tofu çıkar. Bu yüzden `null` döner — çağıran bayrak
 * yerine ülke ADINI basar. Aynısı listede olmayan/bozuk kodlar için de
 * geçerli: uydurma bir bayrak basmaktansa hiç basmamak doğrudur.
 */
export function countryFlag(code: string | null | undefined): string | null {
  if (!code) return null;
  const c = code.trim().toUpperCase();
  if (!/^[A-Z]{2}$/.test(c) || c === "XN" || c === "XK" || !COUNTRY_CODES.has(c)) return null;
  return String.fromCodePoint(...[...c].map((ch) => 0x1f1e6 + ch.charCodeAt(0) - 65));
}
