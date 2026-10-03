import { llmsFullResponse } from "@/lib/seo/llms-response";

/**
 * /llms-full.txt — `llms.txt`in veriyle genişletilmiş hâli (Parça 4).
 *
 * Fark şu: `llms.txt` sitenin KURALLARINI anlatır (kısa, statik, elle
 * yazılmış); bu dosya envanterin O ANKİ hâlini verir — kaç ürün, hangi
 * kategoriler, hangi şehirler/ülkeler, hangi adresler.
 *
 * HER SAYI GERÇEK UÇTAN GELİR. Uydurma ya da yuvarlanmış envanter yazılmaz;
 * uç cevap veremezse o satır hiç basılmaz (boş dosya, yanlış dosyadan
 * iyidir). Saatlik yeniden üretim: envanter dakikada bir değişmiyor.
 * KÖK İNGİLİZCE (2026-09-27); dil sürümleri `/<dil>/llms-full.txt`.
 */
export const dynamic = "force-static";
export const revalidate = 3600;

export function GET(): Promise<Response> {
  return llmsFullResponse("en");
}
