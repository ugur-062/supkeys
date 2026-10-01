/**
 * Onay adımının GÖRÜNEN durumu (arayüz testi D-361).
 *
 * Sunucu, istek reddedilince/iptal edilince kalan adımları güncellemez
 * (`WAITING` / `PENDING` olarak kalır). İstek sonuçlandıysa karar verilmemiş
 * adımlar "sırada" / "karar bekleniyor" değil "gerek kalmadı" (`NOT_NEEDED`)
 * gösterilir. Yalnız görüntü — veri değişmez.
 */
export type ApprovalRequestStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";
export type ApprovalStepDisplayStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SKIPPED"
  | "NOT_NEEDED";

export function displayStepStatus(
  stepStatus: string,
  requestStatus: ApprovalRequestStatus,
): ApprovalStepDisplayStatus {
  if (requestStatus !== "PENDING" && (stepStatus === "WAITING" || stepStatus === "PENDING")) {
    return "NOT_NEEDED";
  }
  return stepStatus as ApprovalStepDisplayStatus;
}
