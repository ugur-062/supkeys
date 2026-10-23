"use client";

import { useTranslations } from "next-intl";
import { MyProfileView } from "@/components/company/my-profile-view";
import { PermissionGate } from "@/components/company/permission-gate";
import { COMPANY_PROFILE_PERMISSIONS } from "@/lib/company/portals";

/**
 * Kapı API `GET company/profile` ile aynı izinler (yalnız "Kullanıcı ve yetki"
 * tikli kişi 403 + sonsuz "Tekrar dene"ye düşüyordu — arayüz testi O-101).
 * Kapı sayfada, düzende değil: yeni düzen bölümü açılmasın.
 */
export default function SirketimProfilPage() {
  const t = useTranslations("web.panel.company.sirketimProfilPage");
  return (
    <PermissionGate
      permission={COMPANY_PROFILE_PERMISSIONS}
      title={t("profilYetkiGerektirir")}
      description={t("buSayfaIcinGerekenIzinler")}
    >
      <MyProfileView />
    </PermissionGate>
  );
}
