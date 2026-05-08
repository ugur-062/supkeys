import { ApprovalFlowWizard } from "../_components/approval-flow-wizard";

export const metadata = {
  title: "Yeni Onay Akışı — Supkeys",
};

export default function YeniOnayAkisiPage() {
  return <ApprovalFlowWizard mode="create" />;
}
