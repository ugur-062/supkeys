import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function FirmaIdLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.company.firmaIdLayout");
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title={t("firmaSayfasiYetkiGerektirir")}
      description={t("firmaSayfalariniBirPortaliGoruntuleme")}
    >
      {children}
    </PermissionGate>
  );
}
