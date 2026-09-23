import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SirketimZiyaretcilerLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"insights:view"}
      title="Ziyaret Edenler yetki gerektirir"
      description="Bu sayfa “Ziyaret edenler ve iş analizi” tikini ister."
    >
      {children}
    </PermissionGate>
  );
}
