import type { UserRole } from "@/lib/auth/types";
import type { ApprovalFlowType } from "@/lib/approval-flows/types";

export type ApprovalRequestStatus =
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "CANCELLED";

export type ApprovalStepStatus =
  | "WAITING"
  | "PENDING"
  | "APPROVED"
  | "REJECTED"
  | "SKIPPED";

export type TenderStatus =
  | "DRAFT"
  | "IN_APPROVAL"
  | "OPEN_FOR_BIDS"
  | "IN_AWARD"
  | "IN_AWARD_APPROVAL"
  | "AWARDED"
  | "CANCELLED"
  | "CLOSED_NO_AWARD";

export type { ApprovalFlowType, UserRole };

export interface ApprovalRequestStep {
  id: string;
  approverUserId: string;
  approver: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: UserRole;
    isActive: boolean;
  };
  status: ApprovalStepStatus;
  orderIndex: number;
  conditionMinAmount: string | null;
  displayLabel: string | null;
  decidedAt: string | null;
  decisionNote: string | null;
  createdAt: string;
}

export interface ApprovalRequestListItem {
  id: string;
  approvalNumber: string;
  type: ApprovalFlowType;
  status: ApprovalRequestStatus;
  amount: string;
  currency: string;
  initiatorNote: string | null;
  startedAt: string;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
  flow: {
    id: string;
    name: string;
    flowNumber: number;
    type: ApprovalFlowType;
  };
  tender: {
    id: string;
    tenderNumber: string;
    title: string;
    status: TenderStatus;
    primaryCurrency: string;
  };
  initiatedBy: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  steps: ApprovalRequestStep[];
}

export interface ApprovalRequestTenderItem {
  id: string;
  orderIndex: number;
  name: string;
  quantity: string;
  unit: string;
  targetUnitPrice: string | null;
}

export interface ApprovalRequestDetail extends ApprovalRequestListItem {
  flow: ApprovalRequestListItem["flow"] & {
    description: string | null;
    status: string;
  };
  tender: ApprovalRequestListItem["tender"] & {
    items: ApprovalRequestTenderItem[];
    invitations: Array<{
      id: string;
      supplier: { id: string; companyName: string };
    }>;
    createdBy: { id: string; firstName: string; lastName: string } | null;
    _count: { items: number };
  };
}

export interface ListApprovalRequestsParams {
  status?: ApprovalRequestStatus;
  type?: ApprovalFlowType;
  initiatorUserId?: string;
  tenderNumber?: string;
  approvalNumber?: string;
  pendingForMe?: boolean;
}
