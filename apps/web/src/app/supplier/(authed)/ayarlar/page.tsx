import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { Settings } from "lucide-react";

export const metadata = {
  title: "Ayarlar",
};

export default function SupplierAyarlarPage() {
  return (
    <PlaceholderPage
      icon={Settings}
      title="Ayarlar"
      subtitle="Hesap ayarlarınız, bildirim tercihleriniz ve güvenlik."
      description="Şifre değiştirme, ekip üyesi davet etme, bildirim kanalları gibi ayarlar yakında eklenecek."
      highlights={[
        "Şifre değiştir",
        "Ekip üyesi ekle (çoklu kullanıcı)",
        "E-posta ve uygulama içi bildirim tercihleri",
        "İki faktörlü doğrulama (2FA)",
      ]}
      backHref="/supplier/dashboard"
      backLabel="Ana sayfaya dön"
    />
  );
}
