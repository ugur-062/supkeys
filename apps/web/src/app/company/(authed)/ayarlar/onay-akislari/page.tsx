"use client";

import { useCompanyAuth } from "@/hooks/use-company-auth";
import { ApprovalFlowsSection } from "../_components/approval-flows-section";
import { SettingsShell } from "../_components/settings-shell";

export default function Page() {
  const { user } = useCompanyAuth();
  const canEdit = !!user?.roles.includes("YONETICI");
  return (
    <SettingsShell
      title="Onay Akışları"
      description="İhale yayın ve kazandırma onay süreçleri."
    >
      <ApprovalFlowsSection canManage={canEdit} />
    </SettingsShell>
  );
}
