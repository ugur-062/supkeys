import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SiparisIdLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.trade.siparisIdLayout");
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title={t("siparisDetayiYetkiGerektirir")}
      description={t("siparisDetayiniBirPortaliGoruntuleme")}
    >
      {children}
    </PermissionGate>
  );
}
