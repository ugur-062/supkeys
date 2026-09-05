import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarBankaHesaplariLayout({ children }: { children: React.ReactNode }) {
  return (
    <PermissionGate
      permission={"billing:manage"}
      title="Banka Hesapları yalnız Kurucuya açık"
      description="Banka hesaplarını yalnız firma kurucusu yönetir."
    >
      {children}
    </PermissionGate>
  );
}
