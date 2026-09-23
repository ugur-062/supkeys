import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarKullanicilarLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"users:manage"}
      title="Kullanıcı Yönetimi yetki gerektirir"
      description="Bu sayfa “Kullanıcı ve yetki” tikini ister."
    >
      {children}
    </PermissionGate>
  );
}
