/**
 * Ayarlar sayfaları — TEK KAYNAK (2026-09-10).
 *
 * Hub kartı ve sayfanın kendi başlığı/açıklaması aynı kayıttan okunur; daha
 * önce iki yerde elle yazılıyor ve ayrışıyordu (kart "Unvan, adres, KEP…"
 * derken sayfa "Kimlik, unvan…" diyordu; kart "telefon" derken sayfa demiyordu).
 * Uzun açıklama gereken sayfa `SettingsShell`e ayrıca `description` geçer;
 * kart her zaman buradaki kısa cümleyi basar.
 */
export interface SettingsPageMeta {
  href: string;
  title: string;
  description: string;
}

export const SETTINGS_PAGES = {
  hesap: {
    href: "/company/ayarlar/hesap-bilgileri",
    title: "Hesap Bilgileri",
    description: "Ad, soyad, telefon ve iletişim bilgileriniz",
  },
  sifre: {
    href: "/company/ayarlar/sifre",
    title: "Şifre İşlemleri",
    description: "Şifrenizi güvenli bir şekilde değiştirin",
  },
  bildirimler: {
    href: "/company/ayarlar/bildirimler",
    title: "Bildirim Tercihleri",
    description: "E-posta bildirimlerinizi yönetin",
  },
  twoFactor: {
    href: "/company/ayarlar/2fa",
    title: "İki Adımlı Doğrulama",
    description: "Authenticator uygulamasıyla ek giriş güvenliği",
  },
  profil: {
    // Firma Bilgileri = ticari kayıt, Firma Profili = Profilim (vitrin) —
    // ayrım korunur; bu kart yalnız Profilim'e köprü.
    href: "/company/sirketim/profil",
    title: "Firma Profili",
    description: "Profilim sayfasını aç — logo, kapak, tanıtım, hizmetler",
  },
  firma: {
    href: "/company/ayarlar/firma",
    title: "Firma Bilgileri",
    description: "Ticari kayıt: kimlik, unvan, adres, faaliyet tipi ve kategoriler",
  },
  adresler: {
    href: "/company/ayarlar/adresler",
    title: "Adres Yönetimi",
    description: "Fatura ve teslimat adresleri",
  },
  banka: {
    href: "/company/ayarlar/banka-hesaplari",
    title: "Banka Hesapları",
    description: "Sipariş onayında seçilen ödeme hesapları",
  },
  kullanicilar: {
    href: "/company/ayarlar/kullanicilar",
    title: "Kullanıcı Yönetimi",
    description: "Ekip üyeleri, roller ve kişi bazlı izinler",
  },
  aktivite: {
    href: "/company/ayarlar/aktivite",
    title: "Aktivite Logu",
    description: "Firmanızda kim ne yaptı — eylem kayıtları",
  },
  ai: {
    href: "/company/ayarlar/ai-kullanim",
    title: "AI Kullanımı",
    description: "Aylık AI bütçenizin ne kadarı kullanıldı",
  },
  onayAkislari: {
    // Onay akışları Onaylar sayfasının kendi görünümünde (`?tab=flows`).
    href: "/company/onaylar?tab=flows",
    title: "Onay Akışları",
    description: "Kazandırma isteklerinin kimden, hangi sırayla onay alacağını tanımlayın",
  },
  dogrulama: {
    href: "/company/ayarlar/dogrulama",
    title: "Doğrulama Belgeleri",
    description: "Vergi levhası, sicil, imza sirküleri — Silver/Gold paketine geçişin ilk adımı",
  },
} as const satisfies Record<string, SettingsPageMeta>;
