import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SatinalmaTaleplerimYeniLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"buy:listing:manage"}
      title="Talep açma yetki gerektirir"
      description="Bu sayfa “Talep açma ve yönetme” tikini ister."
    >
      {children}
    </PermissionGate>
  );
}
