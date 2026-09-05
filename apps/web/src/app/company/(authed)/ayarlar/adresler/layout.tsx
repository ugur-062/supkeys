import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAdreslerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"addresses:manage"}
      title="Adres Yönetimi yetki gerektirir"
      description="Bu sayfa “Adres defteri” tikini ister."
    >
      {children}
    </PermissionGate>
  );
}
