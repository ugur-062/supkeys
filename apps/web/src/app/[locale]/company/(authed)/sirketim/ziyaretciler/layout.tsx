import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SirketimZiyaretcilerLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.company.sirketimZiyaretcilerLayout");
  return (
    <PermissionGate
      permission={"insights:view"}
      title={t("ziyaretEdenlerYetkiGerektirir")}
      description={t("buSayfaZiyaretEdenlerVe")}
    >
      {children}
    </PermissionGate>
  );
}
