import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function IlanIdLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title="Talep detayı yetki gerektirir"
      description="Talep detayını bir portalı görüntüleme izni olanlar görür."
    >
      {children}
    </PermissionGate>
  );
}
