import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarFirmaLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarFirmaLayout");
  return (
    <PermissionGate
      permission={"company:manage"}
      title={t("firmaBilgileriYetkiGerektirir")}
      description={t("buSayfaFirmaProfiliVe")}
    >
      {children}
    </PermissionGate>
  );
}
