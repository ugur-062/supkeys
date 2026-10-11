/**
 * Yol metninin ("P. Üretim Bileşenleri › Hırdavat › Somunlar") başındaki
 * segment harfini atar.
 *
 * Harfler Ariba'nın iç segment kodudur; bir bölümü gizlendiği için aralıklı
 * görünür ("B.", "C." … "AN.", "BF.") ve kullanıcıya bir şey söylemez
 * (2026-10 kayıt denetimi). Yol metni çip ipucunda ve tek seçimli başlıkta
 * gösterildiğinden burada, tek yerde temizlenir. Yalnız "1-2 BÜYÜK Latin harf
 * + nokta + boşluk" kalıbı düşer; sektör adlarının hiçbiri böyle başlamaz.
 *
 * Kanca dosyasında (`use-categories`) DEĞİL: testler o modülü bütünüyle
 * sahteliyor, saf yardımcı orada dursa her sahteye eklenmesi gerekirdi.
 */
export function plainBreadcrumb(breadcrumb: string | null | undefined): string {
  return (breadcrumb ?? "").replace(/^[A-Z]{1,2}\.\s+/, "");
}
