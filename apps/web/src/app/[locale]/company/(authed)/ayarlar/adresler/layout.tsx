import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAdreslerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarAdreslerLayout");
  return (
    <PermissionGate
      permission={"addresses:manage"}
      title={t("adresYonetimiYetkiGerektirir")}
      description={t("buSayfaAdresDefteriTikini")}
    >
      {children}
    </PermissionGate>
  );
}
