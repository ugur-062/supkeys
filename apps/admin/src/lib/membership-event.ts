/**
 * Üyelik geçmişi satırının "Yapan" ve "Gerekçe" sütunları. Admin olayları
 * serbest metin gerekçe + admin e-postası taşır; sistem/firma kaynaklı
 * olaylar ise makine kodu yazar (adminId null). Kod ham basılınca
 * self-servis yükseltme "sistem" / "self_service_upgrade" görünüyordu
 * (arayüz testi api2-01 yeniden doğrulama). Bilinmeyen kod ve serbest metin
 * aynen kalır.
 */
const REASON_LABELS: Record<string, string> = {
  self_service_upgrade: "Firma kendi yükseltti (self-servis)",
};

/** Admin'siz olayda yapanı gerekçe kodundan türet; yoksa "sistem". */
const ACTOR_BY_REASON: Record<string, string> = {
  self_service_upgrade: "firma (self-servis)",
};

export function membershipEventReason(reason: string | null | undefined): string | null {
  if (!reason) return null;
  return REASON_LABELS[reason] ?? reason;
}

export function membershipEventActor(e: {
  adminEmail: string | null;
  reason: string | null;
}): string {
  if (e.adminEmail) return e.adminEmail;
  return (e.reason && ACTOR_BY_REASON[e.reason]) || "sistem";
}
