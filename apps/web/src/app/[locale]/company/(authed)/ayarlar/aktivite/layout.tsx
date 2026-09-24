import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAktiviteLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarAktiviteLayout");
  return (
    <PermissionGate
      permission={["users:manage", "company:manage"]}
      title={t("aktiviteLoguYetkiGerektirir")}
      description={t("buSayfaYonetimYetkisiKullanici")}
    >
      {children}
    </PermissionGate>
  );
}
