import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarKullanicilarLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarKullanicilarLayout");
  return (
    <PermissionGate
      permission={"users:manage"}
      title={t("kullaniciYonetimiYetkiGerektirir")}
      description={t("buSayfaKullaniciVeYetki")}
    >
      {children}
    </PermissionGate>
  );
}
