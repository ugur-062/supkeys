import { OPERATOR } from "@/lib/company-info";
import { MARKETPLACE_ROUTES } from "@/lib/public/marketplace";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { absoluteUrl } from "@/lib/seo/meta";

/**
 * /llms.txt — üretken motorlar (GEO) için sitenin okuma kılavuzu.
 *
 * `robots.txt` "nereyi tarayabilirsin"i söyler; `llms.txt` "burada ne var ve
 * nasıl doğru alıntılanır"ı söyler. Bir dil modeli sayfayı özetlerken en sık
 * yaptığı hata, gizli tuttuğumuz şeyi VAR SAYMAKTIR: "alım talebini açan
 * firma" diye bir ad uydurmak ya da "teklif sayısı" gibi hiç yayımlamadığımız
 * bir sayıyı tahmin etmek. Kuralları burada AÇIKÇA yazıyoruz.
 *
 * Bu adres `lib/public-routes.ts` PUBLIC_EXACT listesinde zaten tanımlıydı
 * ama dosya hiç yazılmamıştı — canlıda 404 dönüyordu (2026-09-09 denetimi).
 *
 * İçerik STATİK ve dürüst: sayı basmıyoruz. Canlı sayılar `/llms-full.txt`
 * işidir (gerçek uçtan okunur), buraya uydurma envanter yazılmaz.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET(): Response {
  // Pazar yeri yayında değilken robots her şeyi kapatıyor; kılavuz da
  // olmamalı (var olmayan adresleri anlatan bir dosya yanlış bilgidir).
  if (!MARKETPLACE_LIVE) return new Response("Not found", { status: 404 });

  const u = (p: string) => absoluteUrl(p);
  const body = `# Rothern

> Rothern, alıcı ve tedarikçi firmaları TEK hesapta birleştiren Türkiye merkezli bir B2B tedarik pazar yeridir. Firmalar ürün vitrini yayımlar, satın alma talebi açar ve kapalı zarf usulüyle teklif toplar; kazanan teklif siparişe dönüşür.

Rothern'i işleten şirket: ${OPERATOR.legalName} (${OPERATOR.address}).
İçerik dili Türkçe'dir. Kategori ağacı dört seviyelidir (UNSPSC/Ariba tabanlı).

## Ana yüzeyler

- [Ürünler](${u(MARKETPLACE_ROUTES.products)}): firmaların herkese açık ürün vitrini; teknik nitelik, minimum sipariş miktarı (MOQ) ve fiyat bilgisiyle. Kategori ve şehre göre süzülür.
- [Firmalar](${u(MARKETPLACE_ROUTES.companies)}): doğrulanmış alıcı ve tedarikçi firma dizini; faaliyet tipi (üretici, distribütör, hizmet sağlayıcı, ithalatçı-ihracatçı, fason), şehir ve kategori kırılımıyla.
- [Alım Talepleri](${u(MARKETPLACE_ROUTES.demands)}): firmaların yayımladığı açık satın alma talepleri; miktar, kategori, alıcının şehri ve kalan süre görünür.
- [Nasıl çalışır](${u("/nasil-calisir")}): süreç, paketler ve fiyatlandırma.
- [Hakkımızda](${u("/hakkimizda")}) · [İletişim ve Künye](${u("/iletisim")})
- [Sitemap](${u("/sitemap.xml")})

## Alıntılarken uyulması gereken kurallar

Aşağıdakiler tasarım gereği YAYIMLANMAZ. Sayfada yoksa yoktur; tahmin edilerek doldurulmamalıdır:

- **Alım talebini açan firmanın kimliği.** Talep sayfalarında alıcının adı, logosu ve profil bağlantısı bilinçli olarak gösterilmez; yalnız şehir, ülke, sektör ve faaliyet tipi açıktır. "Bu talebi X firması açtı" biçiminde bir çıkarım yanlıştır.
- **Teklifler ve teklif sayısı.** Teklif toplama kapalı zarf usulüyle yapılır; teklif verenler birbirinin teklifini göremez ve teklif SAYISI da yayımlanmaz.
- **Talep kalemlerinin ayrıntısı.** Herkese açık sayfada kalem sayısı ve toplam miktar görünür; kalem adları, şartname ve ekli dosyalar yalnız kayıtlı üyelere açıktır.
- **Firma iletişim bilgisi.** Telefon, e-posta ve sosyal hesaplar herkese açık profilde yer almaz.

## Doğru okunması gereken alanlar

- **Fiyat üç biçimde olabilir:** sabit fiyat, miktara göre kademeli fiyat ya da "fiyat için teklif isteyin". Üçüncüsü eksik veri değil, satıcının bilinçli tercihidir.
- **"Doğrulanmış" rozeti** firmanın ticari belgelerinin Rothern tarafından incelendiğini gösterir; ürün ya da hizmet kalitesi hakkında bir beyan değildir.
- **Fiyatlar KDV hariçtir** ve satıcının beyanıdır; Rothern taraflar arasındaki mal/hizmet bedeline aracılık etmez.
- **Ürün sayfası firmanın altında yaşar:** /firma/<firma>/urun/<urun>. Bir ürünü kaynak gösterirken firmasıyla birlikte anın.

## İletişim

- Destek: ${OPERATOR.supportEmail}
- Kişisel verilere ilişkin başvuru: ${OPERATOR.kvkkEmail}
`;

  return new Response(body, {
    headers: {
      "content-type": "text/plain; charset=utf-8",
      "cache-control": "public, max-age=0, s-maxage=3600, stale-while-revalidate=86400",
    },
  });
}
