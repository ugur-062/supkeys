import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarFirmaLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"company:manage"}
      title="Firma Bilgileri yetki gerektirir"
      description="Bu sayfa “Firma profili ve ayarlar” tikini ister."
    >
      {children}
    </PermissionGate>
  );
}
