import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAktiviteLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["users:manage", "company:manage"]}
      title="Aktivite Logu yetki gerektirir"
      description="Bu sayfa yönetim yetkisi (“Kullanıcı ve yetki” ya da “Firma profili ve ayarlar”) ister."
    >
      {children}
    </PermissionGate>
  );
}
