import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";
import { VerifiedOnly } from "@/components/company-shell/premium-only";

/**
 * İş Analizi = SATIŞ tarafının raporu: Silver+ ve "Ziyaret edenler ve iş
 * analizi" izni (API `company/views/insights` → `insights:view`). Satınalma
 * raporu yetkisi buraya GİRİŞ VERMEZ (2026-09-17).
 */
export default function IsAnaliziLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.reports.raporlarIsAnaliziLayout");
  return (
    <VerifiedOnly minTier="SILVER">
      <PermissionGate
        permission="insights:view"
        title={t("isAnaliziYetkiGerektirir")}
        description={t("buSayfaZiyaretEdenlerVe")}
      >
        {children}
      </PermissionGate>
    </VerifiedOnly>
  );
}
