import { useTranslations } from "next-intl";
import { PermissionGate } from "@/components/company/permission-gate";

/** Yetki tablosu Faz 3 — sayfa düzeyi izin kapısı (API aynası). */
export default function SirketimLayout({ children }: { children: React.ReactNode }) {
  const t = useTranslations("web.panel.company.sirketimLayout");
  return (
    <PermissionGate
      permission={["users:manage", "company:manage", "buy:view", "sell:view"]}
      title={t("sirketimAlaniYetkiGerektirir")}
      description={t("sirketimAlaniniYonetimYetkisiYa")}
    >
      {children}
    </PermissionGate>
  );
}
