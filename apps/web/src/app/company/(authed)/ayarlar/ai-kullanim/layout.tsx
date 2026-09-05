import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAiKullanimLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS]}
      title="AI Kullanımı yetki gerektirir"
      description="Bu sayfayı yönetim ya da işlem yetkisi taşıyanlar görür."
    >
      {children}
    </PermissionGate>
  );
}
