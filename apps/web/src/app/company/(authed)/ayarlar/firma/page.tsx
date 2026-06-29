"use client";

import { CompanyProfileSection } from "../_components/company-profile-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  return (
    <SettingsShell
      title="Firma Profili"
      description="Vergi, iletişim, adres ve kategori bilgileri."
    >
      <CompanyProfileSection />
    </SettingsShell>
  );
}
