/**
 * FAALİYET TİPİ — firmanın bir kategoride NE YAPTIĞI.
 *
 * NEDEN VAR: Europages her firmayı İKİ eksende listeler — kategori (ne) ve
 * faaliyet tipi (nasıl). Bizde ikinci eksen hiç yoktu: `CompanyType` yalnız
 * HUKUKİ biçim (A.Ş./Ltd./şahıs), `industry` ise serbest metin. Sonuç: "paslanmaz
 * boru" arayan alıcı, üreticiyle bayiyi ve fasoncuyu aynı listede görüyordu.
 *
 * Alıcı için bu ayrım çoğu zaman kategoriden daha belirleyici:
 *  · seri üretim işi → üretici gerekir, bayi fiyat kıramaz
 *  · tek kalem acil ihtiyaç → bayi/distribütör stoktan verir, üretici vermez
 *  · çizimle parça yaptırma → fason imalatçı aranır
 *
 * ÇOKLU SEÇİM: bir firma hem üretici hem ihracatçı olabilir; tek değere
 * zorlamak gerçeği bozar. Bu yüzden Company.activities bir DİZİ.
 *
 * KATEGORİDEN BAĞIMSIZ: faaliyet tipi firma düzeyindedir, kategori başına
 * değil. Kategori başına faaliyet tutmak veri modelini ve arayüzü ikiye
 * katlardı; kazancı ise ancak çok kollu holdinglerde hissedilir — KOBİ
 * odağımızda karşılığı yok.
 */

export const COMPANY_ACTIVITIES = [
  {
    code: "MANUFACTURER",
    nameTr: "Üretici",
    /** Seçim ekranında ne demek olduğunu anlatan tek cümle. */
    hintTr: "Ürünü kendi tesisinde imal ediyor",
  },
  {
    code: "DISTRIBUTOR",
    nameTr: "Distribütör / Bayi",
    hintTr: "Başkasının ürettiğini stoklayıp satıyor",
  },
  {
    code: "SERVICE_PROVIDER",
    nameTr: "Hizmet sağlayıcı",
    hintTr: "Ürün değil hizmet veriyor (montaj, bakım, mühendislik)",
  },
  {
    code: "IMPORTER_EXPORTER",
    nameTr: "İthalatçı / İhracatçı",
    hintTr: "Dış ticaret yapıyor",
  },
  {
    code: "CONTRACT_MANUFACTURER",
    nameTr: "Fason imalatçı",
    hintTr: "Müşterinin çizimine/markasına göre üretiyor",
  },
] as const;

export type CompanyActivityCode = (typeof COMPANY_ACTIVITIES)[number]["code"];

export const COMPANY_ACTIVITY_CODES = COMPANY_ACTIVITIES.map(
  (a) => a.code,
) as readonly CompanyActivityCode[];

const BY_CODE = new Map(COMPANY_ACTIVITIES.map((a) => [a.code, a]));

export function companyActivityLabel(code: string): string {
  return BY_CODE.get(code as CompanyActivityCode)?.nameTr ?? code;
}

export function isCompanyActivity(code: string): code is CompanyActivityCode {
  return BY_CODE.has(code as CompanyActivityCode);
}

/**
 * Seçim tavanı. Beşinin hepsini işaretleyen firma hiçbir şey söylememiş olur ve
 * eşleştirmeyi bozar (her aramada çıkar). Üç, gerçek bir KOBİ profilinin
 * ("üretici + ihracatçı + fason") üstünü örter.
 */
export const MAX_COMPANY_ACTIVITIES = 3;
