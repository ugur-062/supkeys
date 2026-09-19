/**
 * "BAĞLANTILARIM" = GÖRÜNÜRLÜK LİSTESİ (2026-09-19, kullanıcı kararı: "o kişiyi
 * çıkarırsa bildirim ve e-posta gitmediği gibi alım talebini de görmeyecek").
 *
 * Sunucuda CONNECTIONS görünürlüğü "tüm bağlantılar görür" demektir ve dışlama
 * kavramı yoktur. Ekranda bağlantıların TAMAMI işaretli açılır; alıcı kimseyi
 * çıkarmadıysa talep CONNECTIONS + herkese davet olarak gider (sonradan
 * eklenen bağlantılar da görür). En az bir bağlantı çıkarıldıysa talep
 * PRIVATE + yalnız işaretli firmalar olarak gider → çıkarılan firma talebi
 * hiç görmez, bildirim/e-posta almaz. Alıcı için ekran "Bağlantılarım"dır.
 *
 * Tek kaynak: hızlı kartın yayın ve taslak yolu bu fonksiyondan geçer.
 */
export function applyConnectionsScope<T extends { visibility: "PUBLIC" | "CONNECTIONS" | "PRIVATE"; invitedSupplierIds?: string[] }>(
  values: T,
  connectionIds: string[],
): T {
  if (values.visibility !== "CONNECTIONS") return values;
  const invited = new Set(values.invitedSupplierIds ?? []);
  const excluded = connectionIds.some((id) => !invited.has(id));
  if (!excluded) return values;
  return { ...values, visibility: "PRIVATE", invitedSupplierIds: [...invited].filter((id) => connectionIds.includes(id)) };
}
