/**
 * TEKLİF TOPLAMININ YAZI BOYU KUTUSUNA SIĞAR (mobil denetim 2026-10).
 *
 * 1024 px'te sabit kenar çubuğuyla sağ kolon 221 px (kartın iç genişliği
 * 181 px); 24 px'lik "1.800.000.000,00 ₺" kartı (x=1028) ve sayfayı yana
 * taşırıyordu (scrollWidth 1028 > 1024). Tutar BÖLÜNMEZ (`whitespace-nowrap`
 * parça; sayının ortasından satır kırmak okunmaz) — bunun yerine yazı boyu,
 * en uzun parçanın kutunun iç genişliğine sığacağı kadar küçülür.
 *
 * Kural CSS'te: `100cqi` en yakın `@container` atasının iç genişliğidir; parça
 * N karakterse yazı boyu `100cqi / (N × MONEY_CHAR_EM)` — Inter kalın,
 * `tabular-nums` rakamda karakter başına ölçülen ~0,55 em (1024'te
 * "2.226.123.206,00 ₺" 24 px'te 236 px) + pay. Üstte sınıfın boyu (`max`),
 * altta okunurluk tabanı (`min`). Kısa tutarda boy DEĞİŞMEZ (sınıfınki).
 *
 * Kapsayıcı birimini tanımayan tarayıcıda değer geçersiz sayılır ve atılır →
 * sınıfın yazı boyu (eski görünüm) kalır.
 */
export const MONEY_CHAR_EM = 0.6;

export function fitMoneyFontSize(
  parts: readonly string[],
  { max, min }: { max: number; min: number },
): string | undefined {
  // Kod noktası sayısı (vekil çiftleri tek sayılsın).
  const longest = parts.reduce((n, p) => Math.max(n, [...p].length), 0);
  if (longest === 0) return undefined;
  const per = Number((longest * MONEY_CHAR_EM).toFixed(2));
  return `clamp(${min}rem, calc(100cqi / ${per}), ${max}rem)`;
}
