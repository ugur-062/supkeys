import { llmsResponse } from "@/lib/seo/llms-response";

/**
 * /llms.txt — üretken motorlar (GEO) için sitenin okuma kılavuzu.
 *
 * `robots.txt` "nereyi tarayabilirsin"i söyler; `llms.txt` "burada ne var ve
 * nasıl doğru alıntılanır"ı söyler. Bir dil modeli sayfayı özetlerken en sık
 * yaptığı hata, gizli tuttuğumuz şeyi VAR SAYMAKTIR: "alım talebini açan
 * firma" diye bir ad uydurmak ya da "teklif sayısı" gibi hiç yayımlamadığımız
 * bir sayıyı tahmin etmek. Kuralları burada AÇIKÇA yazıyoruz.
 *
 * KÖK DOSYA İNGİLİZCE (2026-09-27): üretken motorlar çoğunlukla İngilizce
 * okur; Türkçe ve Rusça sürüm `/tr/llms.txt`, `/ru/llms.txt` (dosyanın
 * sonunda bağlantılı). Metin ve adresler `lib/seo/llms.ts`te.
 *
 * İçerik STATİK ve dürüst: sayı basmıyoruz. Canlı sayılar `/llms-full.txt`
 * işidir (gerçek uçtan okunur), buraya uydurma envanter yazılmaz.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET(): Response {
  return llmsResponse("en");
}
