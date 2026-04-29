import { PlaceholderPage } from "@/components/dashboard/placeholder-page";
import { Settings } from "lucide-react";

export const metadata = {
  title: "Ayarlar — Supkeys",
};

export default function AyarlarPage() {
  return (
    <PlaceholderPage
      title="Ayarlar"
      subtitle="Firma bilgileri, kullanıcılar, onay zincirleri ve entegrasyonlar."
      description="Şifre değiştirme, ekibe üye davet etme, rol/yetki ayarları, e-posta tercihleri ve API anahtarlarını yönetebileceksin."
      icon={Settings}
      estimatedRelease="V2"
      highlights={[
        "Kullanıcı yönetimi (davet, rol, yetki)",
        "Onay zinciri konfigürasyonu",
        "API anahtarları ve entegrasyonlar",
      ]}
    />
  );
}
