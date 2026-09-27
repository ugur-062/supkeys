import type { ExternalInviteStatus } from "@/hooks/use-supplier-discovery";

/**
 * Dış davet kabul edildi mi (2026-09-27): e-postalar artık KUYRUKTAN gider —
 * QUEUED başarıdır (alıcının mesai saatinde gönderilecek), SENT eski yanıt.
 * Saf modül: hook dosyasını tümden sahteleyen bileşen testleri de okuyabilsin.
 */
export function isInviteAccepted(status: ExternalInviteStatus): boolean {
  return status === "QUEUED" || status === "SENT";
}
