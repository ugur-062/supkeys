import { useTranslations } from "next-intl";
import { ALL_SEAT_PERMISSIONS } from "@rothern/shared";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function AyarlarAiKullanimLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.settings.ayarlarAiKullanimLayout");
  return (
    <PermissionGate
      permission={["users:manage", "company:manage", ...ALL_SEAT_PERMISSIONS]}
      title={t("aiKullanimiYetkiGerektirir")}
      description={t("buSayfayiYonetimYaDa")}
    >
      {children}
    </PermissionGate>
  );
}
