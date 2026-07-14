/**
 * Teslim şeklinin sipariş adımına etkisi. Bazı teslim şekillerinde malı SATICI
 * taşır/gönderir (adrese teslim, DDP…), bazılarında ALICI kendi toplar / taşıyıcı
 * alır (EXW, fabrika teslim, FOB…). "Siparişi Gönder" adımı yalnız satıcının
 * taşıdığı şekillerde doğrudur; diğerlerinde satıcı malı "teslime hazırlar".
 */

// Alıcının/taşıyıcının malı topladığı teslim şekilleri — satıcı GÖNDERMEZ,
// yalnız hazırlar/teslim eder. (EXW ve yurtiçi "fabrika teslim" ailesi + satıcının
// yalnız taşıyıcıya/gemiye bıraktığı FCA/FAS/FOB.)
const BUYER_COLLECTS_TERMS = new Set<string>([
  "DOMESTIC_PICKUP", // fabrika/depo teslim — alıcı kendisi alır
  "DOMESTIC_CARRIER_COLLECT", // ambara/kargoya teslim — nakliye alıcıya (karşı ödemeli)
  "EXW", // Ex Works — tesiste teslim, tüm taşıma alıcıda
  "FCA", // taşıyıcıya teslim (alıcının taşıyıcısı)
  "FAS", // geminin yanına teslim — ana taşıma alıcıda
  "FOB", // gemiye yüklenmiş teslim — ana taşıma alıcıda
]);

/**
 * Satıcı malı fiilen taşır/gönderir mi? true → "Siparişi Gönder / Gönderildi"
 * adımı; false → "Teslime Hazırla / Teslime Hazır" (alıcı gelip alır/taşıtır).
 * Bilinmeyen/boş teslim şeklinde güvenli varsayılan: satıcı gönderir (true).
 */
export function sellerShipsGoods(deliveryTerm: string | null | undefined): boolean {
  if (!deliveryTerm) return true;
  return !BUYER_COLLECTS_TERMS.has(deliveryTerm);
}
