import { ApprovalsGate } from "@/components/company/approvals-gate";

/** Onaylar — izin kapısı (approval:act ∨ approvals:manage); bkz. ApprovalsGate. */
export default function OnaylarLayout({ children }: { children: React.ReactNode }) {
  return <ApprovalsGate>{children}</ApprovalsGate>;
}
