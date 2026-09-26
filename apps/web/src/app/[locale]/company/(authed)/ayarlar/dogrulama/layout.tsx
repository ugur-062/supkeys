import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarDogrulamaLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarDogrulamaLayout");
  return (
    <PermissionGate
      permission={"company:manage"}
      title={t("dogrulamaBelgeleriYetkiGerektirir")}
      description={t("buSayfaFirmaProfiliVe")}
    >
      {children}
    </PermissionGate>
  );
}
