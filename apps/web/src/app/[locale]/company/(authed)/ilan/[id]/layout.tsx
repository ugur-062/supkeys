import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function IlanIdLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.requests.layout");
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title={t("talepDetayiYetkiGerektirir")}
      description={t("talepDetayiniBirPortaliGoruntuleme")}
    >
      {children}
    </PermissionGate>
  );
}
