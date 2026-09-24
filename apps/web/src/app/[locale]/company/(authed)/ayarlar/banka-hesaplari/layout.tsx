import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarBankaHesaplariLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarBankaHesaplariLayout");
  return (
    <PermissionGate
      permission={"billing:manage"}
      title={t("bankaHesaplariYalnizKurucuyaAcik")}
      description={t("bankaHesaplariniYalnizFirmaKurucusu")}
    >
      {children}
    </PermissionGate>
  );
}
