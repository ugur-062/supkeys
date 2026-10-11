/**
 * 2026-09-27'den ÖNCE sistemin Türkçe cümle olarak sakladığı gerekçe/ödeme
 * metinleri — VERİ (arayüz metni değil): `helpers/system-text.ts` eski
 * kayıtları bu kalıplarla tanıyıp okuyucunun dilinde çizdirir. Yeni kayıt
 * bunları YAZMAZ (kod saklanır).
 */
export const LEGACY_SYSTEM_TEXT_PREFIXES: ReadonlyArray<readonly [string, "ORDER_REJECTED" | "ADMIN"]> = [
  ["Sipariş satıcı tarafından reddedildi:", "ORDER_REJECTED"],
  ["[Yönetici]", "ADMIN"],
];

export const LEGACY_SYSTEM_TEXT_EXACT: Readonly<Record<string, "CANCEL_REQUEST_APPROVED" | "LC_PAID_VIA_BANK">> = {
  "Satıcı iptal talebi onaylandı": "CANCEL_REQUEST_APPROVED",
  "Akreditif ödemesi banka kanalından alındı": "LC_PAID_VIA_BANK",
};

/** Eski akreditif ödeme kaydının yöntemi. */
export const LEGACY_LC_PAYMENT_METHOD = "Akreditif";

/** Çek ödemesi yöntem değeri — DTO sözleşmesi (istemci bunu gönderir), Türkçe KALIR. */
export const CHEQUE_PAYMENT_METHOD = "Çek";
