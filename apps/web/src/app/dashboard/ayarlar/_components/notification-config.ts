export interface NotificationItem {
  key: string;
  label: string;
}

export interface NotificationGroupDef {
  key: string;
  label: string;
  /** Sistem grupları toggle'lanamaz (güvenlik bildirimleri vb.) */
  locked?: boolean;
  items: NotificationItem[];
}

export const NOTIFICATION_GROUPS: NotificationGroupDef[] = [
  {
    key: "ihale",
    label: "İhale ile ilgili bildirimler",
    items: [
      { key: "ihale_acilis", label: "İhale açılış bildirimi" },
      { key: "ihale_kapanis", label: "İhale kapanış bildirimi" },
      { key: "ihale_uzatildi", label: "İhale uzatıldı bildirimi" },
      { key: "ihale_iptal", label: "İhale iptali bildirimi" },
      { key: "ihale_tamamlandi", label: "İhale tamamlandı bildirimi" },
      { key: "teklif_alindi", label: "Teklif alındı bildirimi" },
      { key: "teklif_revize", label: "Teklif revize bildirimi" },
      { key: "teklif_elendi", label: "Teklif eleme bildirimi" },
    ],
  },
  {
    key: "onay",
    label: "Onay süreçleri ile ilgili bildirimler",
    items: [
      { key: "onay_bekliyor", label: "Onayınız bekliyor" },
      { key: "onay_sonuc", label: "Onay süreç sonucu" },
    ],
  },
  {
    key: "siparis",
    label: "Sipariş ile ilgili bildirimler",
    items: [
      { key: "siparis_olustu", label: "Sipariş oluşturuldu" },
      { key: "siparis_durum", label: "Sipariş durum değişikliği" },
    ],
  },
  {
    key: "tedarikci",
    label: "Tedarikçi yönetimi ile ilgili bildirimler",
    items: [
      { key: "tedarikci_basvuru", label: "Tedarikçi başvurusu" },
      { key: "tedarikci_kabul", label: "Tedarikçi davet kabulü" },
    ],
  },
  {
    key: "sistem",
    label: "Tercihinizden bağımsız gönderilecek bildirimler",
    locked: true,
    items: [
      { key: "guvenlik", label: "Güvenlik bildirimleri" },
      { key: "sifre_sifirlama", label: "Şifre sıfırlama" },
    ],
  },
];

/**
 * V1 default: tüm anahtarlar `true` (opt-in). Saved value `false` ise off,
 * kayıt yoksa default `true`.
 */
export function isPrefOn(
  prefs: Record<string, boolean> | null | undefined,
  key: string,
): boolean {
  if (!prefs) return true;
  if (typeof prefs[key] === "boolean") return prefs[key];
  return true;
}
