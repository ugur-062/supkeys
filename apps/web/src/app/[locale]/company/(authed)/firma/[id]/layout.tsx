import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function FirmaIdLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title="Firma sayfası yetki gerektirir"
      description="Firma sayfalarını bir portalı görüntüleme izni olanlar görür."
    >
      {children}
    </PermissionGate>
  );
}
