"use client";

import { CompanyProfileSection } from "../_components/company-profile-section";
import { SettingsShell } from "../_components/settings-shell";
import { SETTINGS_PAGES } from "@/lib/company/settings-pages";

export default function Page() {
  return (
    <SettingsShell page={SETTINGS_PAGES.firma}>
      <CompanyProfileSection />
    </SettingsShell>
  );
}
