import type { UserRole } from "@/lib/auth/types";

export type ApprovalFlowType = "TENDER_PUBLISH" | "TENDER_AWARD";
export type ApprovalFlowStatus = "DRAFT" | "ACTIVE" | "PASSIVE";

export interface ApprovalFlowUserRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  role: UserRole;
}

export interface ApprovalFlowInitiator {
  id: string;
  flowId: string;
  userId: string;
  user: ApprovalFlowUserRef;
  createdAt: string;
}

export interface ApprovalFlowStep {
  id: string;
  flowId: string;
  orderIndex: number;
  approverUserId: string;
  approver: ApprovalFlowUserRef;
  /** decimal serialized as string */
  conditionMinAmount: string | null;
  conditionCurrency: string | null;
  displayLabel: string | null;
  createdAt: string;
}

export interface ApprovalFlow {
  id: string;
  tenantId: string;
  flowNumber: number;
  name: string;
  description: string | null;
  type: ApprovalFlowType;
  status: ApprovalFlowStatus;
  createdById: string;
  createdBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  initiators: ApprovalFlowInitiator[];
  steps: ApprovalFlowStep[];
  createdAt: string;
  updatedAt: string;
}

export interface ApprovalFlowStepInput {
  orderIndex: number;
  approverUserId: string;
  conditionMinAmount?: number;
  conditionCurrency?: string;
  displayLabel?: string;
}

export interface CreateApprovalFlowPayload {
  name: string;
  description?: string;
  type: ApprovalFlowType;
  status?: ApprovalFlowStatus;
  initiatorUserIds: string[];
  steps: ApprovalFlowStepInput[];
}

export type UpdateApprovalFlowPayload = Partial<CreateApprovalFlowPayload>;

export interface ListApprovalFlowsParams {
  type?: ApprovalFlowType;
  status?: ApprovalFlowStatus;
}
