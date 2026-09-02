/**
 * YAYIN ANAHTARI — pazar yeri herkese açık mı.
 *
 * `false` iken kök `/` "yakında" sayfasını gösterir ve pazar yeri rotaları
 * (`/alim-talepleri`, `/satilik`, `/tedarikciler`, `/talep/*`, `/ilan/*`)
 * 404 döner; sitemap yalnız kurumsal sayfaları listeler ve robots.txt her
 * şeyi kapatır. Panel, giriş, kayıt ve sözleşmeler ETKİLENMEZ.
 *
 * Neden anahtar var: pazar yerini açmak GERİ ALINAMAZ bir dış etki. Arama
 * motoru bir kez indeksledikten sonra sayfaları kaldırsanız bile düşmesi
 * arama motorunun tarama sıklığına bağlıdır — bizim denetimimizde değil
 * (Aracılık Sözleşmesi md. 2'de böyle yazılı). Ayrıca envanter azken
 * indekslenmek kalıcı bir "ince içerik" sinyali bırakır: alan adı yeni
 * içerikle bile bir süre bu gölgeyi taşır. O yüzden açılış bir KOD
 * değişikliğiyle değil, bilinçli bir env kararıyla olur.
 *
 * Açmak için: Vercel'de `NEXT_PUBLIC_MARKETPLACE_LIVE=true` + redeploy.
 * (Build zamanı okunur — `NEXT_PUBLIC_` öneki bunu zorunlu kılar.)
 */
export const MARKETPLACE_LIVE =
  process.env.NEXT_PUBLIC_MARKETPLACE_LIVE === "true";
