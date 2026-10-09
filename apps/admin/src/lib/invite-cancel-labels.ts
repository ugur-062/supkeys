/**
 * Kayıtsız adrese talep davetinin (`external_listing_invites`) İPTAL NEDENİ →
 * Türkçe etiket. Büyüme sayfasının "İptal nedenleri" tablosu buradan okur;
 * haritada olmayan neden ham kodla ("AUTO_INVITE_OFF") görünürdü.
 *
 * Nedenleri API yazar (kolon serbest metin): dağıtıcı
 * (`external-invite-dispatcher.service.ts`), davet bağlantısı iptali
 * (`company-connections.service.ts`, `admin-inspection.service.ts`) ve yetki
 * düşüşü (`common/company/downgrade-invites.ts`). API'ye yeni bir neden
 * eklenince buraya da eklenir — `__tests__/invite-cancel-labels.test.ts` API
 * kaynağını tarar ve etiketsiz nedeni yakalar.
 *
 * `OTHER`: nedeni boş (NULL) satırlar (`admin-growth.service.ts`).
 */
export const INVITE_CANCEL_LABEL: Record<string, string> = {
  OPTED_OUT: "Davet almak istemiyor",
  REGISTERED: "Arada kayıt oldu",
  LISTING_CLOSED: "Talep kapandı",
  PAUSED: "3 yanıtsız e-posta (durduruldu)",
  FREQUENCY: "7 gün kuralı — kapanıştan önce sıra gelmedi",
  SUPPRESSED: "Adres e-posta almıyor",
  ALLOWLIST: "Bu ortamda gönderilmedi (alıcı izin listesi)",
  REFERRAL_CANCELLED: "Davet eden iptal etti",
  INVITER_DOWNGRADED: "Davet eden firmanın davet yetkisi kalktı",
  AUTO_INVITE_OFF: "Talep özele çevrildi ya da otomatik arama kapatıldı",
  COUNTRY_BLOCKED: "Kayda kapalı ülke",
  OTHER: "Diğer",
};

/** Neden kodunun etiketi; bilinmeyen kod olduğu gibi döner. */
export function inviteCancelLabel(reason: string): string {
  return INVITE_CANCEL_LABEL[reason] ?? reason;
}
