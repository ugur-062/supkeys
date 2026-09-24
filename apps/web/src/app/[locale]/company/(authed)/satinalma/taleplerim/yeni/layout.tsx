import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SatinalmaTaleplerimYeniLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.requests.layout");
  return (
    <PermissionGate
      permission={"buy:listing:manage"}
      title={t("talepAcmaYetkiGerektirir")}
      description={t("buSayfaTalepAcmaVe")}
    >
      {children}
    </PermissionGate>
  );
}
