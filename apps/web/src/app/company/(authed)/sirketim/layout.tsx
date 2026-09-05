import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SirketimLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["users:manage", "company:manage", "buy:view", "sell:view"]}
      title="Şirketim alanı yetki gerektirir"
      description="Şirketim alanını yönetim yetkisi ya da en az bir portalı görüntüleme izni olanlar görür."
    >
      {children}
    </PermissionGate>
  );
}
