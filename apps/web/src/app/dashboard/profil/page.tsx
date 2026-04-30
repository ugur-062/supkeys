import { PlaceholderPage } from "@/components/dashboard/placeholder-page";

export const metadata = {
  title: "Profilim — Supkeys",
};

export default function ProfilPage() {
  return (
    <PlaceholderPage
      iconKey="profil"
      title="Profilim"
      subtitle="Hesap bilgilerinizi ve tercihlerinizi yönetin."
      description="Ad-soyad, iletişim, şifre değiştirme, bildirim tercihleri ve oturum geçmişiniz burada olacak."
      estimatedRelease="V2"
      highlights={[
        "Profil bilgilerini düzenleme",
        "Şifre değiştirme ve 2FA",
        "Bildirim tercihleri",
      ]}
    />
  );
}
