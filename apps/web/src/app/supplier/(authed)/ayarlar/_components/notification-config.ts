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
    label: "İhale bildirimleri",
    items: [
      { key: "ihale_davet", label: "Yeni ihale daveti" },
      {
        key: "ihale_kategori_oneri",
        label: "Kategorime uygun yeni ihale (öneri)",
      },
      { key: "ihale_guncellendi", label: "Davetli olduğum ihale güncellendi" },
      { key: "ihale_uzatildi", label: "İhale süresi uzatıldı" },
      { key: "ihale_iptal", label: "İhale iptal edildi" },
      { key: "ihale_kapanis", label: "İhale kapanışı yaklaşıyor" },
    ],
  },
  {
    key: "teklif",
    label: "Teklif bildirimleri",
    items: [
      { key: "teklif_alindi", label: "Teklifim alındı" },
      { key: "teklif_elendi", label: "Teklifim elendi" },
      { key: "teklif_kazandi", label: "İhaleyi kazandım" },
    ],
  },
  {
    key: "siparis",
    label: "Sipariş bildirimleri",
    items: [
      { key: "siparis_olustu", label: "Yeni sipariş oluşturuldu" },
      { key: "siparis_durum", label: "Sipariş durumu değişti" },
    ],
  },
  {
    key: "mesaj",
    label: "Mesaj bildirimleri",
    items: [{ key: "mesaj_yeni", label: "Yeni mesaj aldım" }],
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
 * Default: tüm anahtarlar `true` (opt-in). Saved value `false` ise off,
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
