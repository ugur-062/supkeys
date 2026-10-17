/**
 * "API'ye şu an ulaşılamıyor" işareti — SUNUCU ile İSTEMCİ arasındaki tek köprü.
 *
 * Üretimde Next, sunucu bileşeni hatasının mesajını istemciye GÖNDERMEZ; hata
 * sınırı yalnız `digest` alanını görür. Next (15.5 `create-error-handler`)
 * hatanın üzerinde hazır bir `digest` varsa onu KORUR (yoksa mesaj + yığından
 * özet üretir). `PublicApiUnavailableError` bu sabiti `digest` olarak taşır;
 * hata sınırı (`app/[locale]/error.tsx`) aynı sabitle "geçici kesinti"
 * ekranını seçer. Sabit bilgi sızdırmaz: yol, adres ya da durum kodu içermez.
 *
 * Bu dosya İSTEMCİ paketine girer → sunucuya özgü hiçbir şey içe aktarmaz.
 */
export const PUBLIC_API_UNAVAILABLE_DIGEST = "ROTHERN_PUBLIC_API_UNAVAILABLE";

/**
 * Hata, herkese açık API kesintisinden mi? Next ileride özete hata kodu
 * eklerse (`<digest>@E123`, `error-telemetry-utils`) da tanınır.
 */
export function isPublicApiUnavailable(error: unknown): boolean {
  if (typeof error !== "object" || error === null) return false;
  const digest = (error as { digest?: unknown }).digest;
  if (typeof digest !== "string") return false;
  return digest === PUBLIC_API_UNAVAILABLE_DIGEST || digest.startsWith(`${PUBLIC_API_UNAVAILABLE_DIGEST}@`);
}
