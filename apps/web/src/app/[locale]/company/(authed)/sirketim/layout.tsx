import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";
import { COMPANY_AREA_PERMISSIONS } from "@/lib/company/portals";

/**
 * Yetki tablosu Faz 3 — alan kapısı: alandaki sayfalardan EN AZ BİRİNİ açan
 * her izin geçer (tek "Ziyaret edenler" ya da "Satınalma raporları" tikli kişi
 * de — arayüz testi O-062); asıl kapı sayfa başına (alt düzen / sayfa).
 */
export default function SirketimLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.company.sirketimLayout");
  return (
    <PermissionGate
      permission={COMPANY_AREA_PERMISSIONS}
      title={t("sirketimAlaniYetkiGerektirir")}
      description={t("sirketimAlaniniYonetimYetkisiYa")}
    >
      {children}
    </PermissionGate>
  );
}
