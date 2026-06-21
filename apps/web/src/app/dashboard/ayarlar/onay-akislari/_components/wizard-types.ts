import type {
  ApprovalFlowStatus,
  ApprovalFlowType,
} from "@/lib/approval-flows/types";

export interface FlowStepDraft {
  orderIndex: number;
  approverUserId: string;
  conditionMinAmount?: number;
  conditionCurrency?: string;
  displayLabel?: string;
}

export interface FlowDraft {
  name: string;
  description: string;
  type: ApprovalFlowType;
  status: ApprovalFlowStatus;
  initiatorUserIds: string[];
  steps: FlowStepDraft[];
}

export const EMPTY_DRAFT: FlowDraft = {
  name: "",
  description: "",
  // Madde 22 — onay artık yalnızca kazandırma (TENDER_AWARD) için.
  type: "TENDER_AWARD",
  status: "DRAFT",
  initiatorUserIds: [],
  steps: [],
};
