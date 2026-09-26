import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function MesajlarLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.inbox.mesajlarLayout");
  return (
    <PermissionGate
      permission={["buy:view", "sell:view"]}
      title={t("mesajlarYetkiGerektirir")}
      description={t("mesajKutusunuBirPortaliGoruntuleme")}
    >
      {children}
    </PermissionGate>
  );
}
