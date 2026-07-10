/** İlan/sipariş/teklif durum etiketleri — admin inceleme ekranları. */

export const LISTING_STATUS: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" | "blue" }
> = {
  DRAFT: { label: "Taslak", color: "zinc" },
  IN_APPROVAL: { label: "Onayda", color: "amber" },
  OPEN: { label: "Açık", color: "green" },
  CLOSED: { label: "Kapalı", color: "amber" },
  IN_AWARD: { label: "Kazandırmada", color: "blue" },
  IN_AWARD_APPROVAL: { label: "Kazandırma onayında", color: "blue" },
  AWARDED: { label: "Kazandırıldı", color: "green" },
  CLOSED_NO_AWARD: { label: "Kazanansız kapandı", color: "zinc" },
  CANCELLED: { label: "İptal", color: "red" },
};

export const ORDER_STATUS: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" | "blue" }
> = {
  PENDING: { label: "Satıcı onayı bekliyor", color: "amber" },
  ACCEPTED: { label: "Onaylandı", color: "blue" },
  CREATED: { label: "Oluşturuldu", color: "zinc" },
  IN_DELIVERY: { label: "Kargoda", color: "blue" },
  DELIVERED: { label: "Teslim edildi", color: "green" },
  COMPLETED: { label: "Tamamlandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
  CANCELLED: { label: "İptal", color: "red" },
};

export const BID_STATUS: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" | "blue" }
> = {
  DRAFT: { label: "Taslak", color: "zinc" },
  SUBMITTED: { label: "Verildi", color: "blue" },
  UNDER_REVIEW: { label: "Değerlendirmede", color: "amber" },
  WON: { label: "Kazandı", color: "green" },
  LOST: { label: "Elendi", color: "red" },
  WITHDRAWN: { label: "Geri çekildi (legacy)", color: "zinc" },
};

export const PAYMENT_STATUS: Record<
  string,
  { label: string; color: "green" | "amber" | "red" | "zinc" | "blue" }
> = {
  AWAITING_CONFIRMATION: { label: "Onay bekliyor", color: "amber" },
  CONFIRMED: { label: "Onaylandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

export function fmtMoney(v: number | string, currency: string): string {
  const n = typeof v === "string" ? Number(v) : v;
  if (!Number.isFinite(n)) return "—";
  const sym = currency === "TRY" ? "₺" : ` ${currency}`;
  return `${n.toLocaleString("tr-TR", { maximumFractionDigits: 2 })}${sym}`;
}
