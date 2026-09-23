import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function MesajlarLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title="Mesajlar yetki gerektirir"
      description="Mesaj kutusunu bir portalı görüntüleme izni olanlar görür."
    >
      {children}
    </PermissionGate>
  );
}
