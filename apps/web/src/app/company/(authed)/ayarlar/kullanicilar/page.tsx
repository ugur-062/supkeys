"use client";

import {
  useCompanyAuth,
  useHasCompanyPermission,
} from "@/hooks/use-company-auth";
import { CompanyUsersSection } from "../_components/company-users-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  const { user } = useCompanyAuth();
  const canEdit = useHasCompanyPermission("users:manage");
  return (
    <SettingsShell page={SETTINGS_PAGES.kullanicilar}>
      <CompanyUsersSection canManage={canEdit} meId={user?.id} />
    </SettingsShell>
  );
}
