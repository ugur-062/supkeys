"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { CompanyUsersSection } from "../_components/company-users-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  const { user } = useCompanyAuth();
  const canEdit = !!user && (user.isOwner || user.roles.includes("YONETICI"));
  return (
    <SettingsShell
      title="Kullanıcı Yönetimi"
      description="Ekip üyeleri, roller ve kişi-bazlı izinler."
    >
      <CompanyUsersSection canManage={canEdit} meId={user?.id} />
    </SettingsShell>
  );
}
