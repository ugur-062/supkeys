export type DemoRequestStatus =
  | "NEW"
  | "CONTACTED"
  | "DEMO_SCHEDULED"
  | "DEMO_DONE"
  | "WON"
  | "LOST"
  | "SPAM";

export interface AssignedAdmin {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface DemoRequest {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  phone: string | null;
  jobTitle: string | null;
  companySize: string | null;
  message: string | null;
  status: DemoRequestStatus;
  source: string | null;
  notes: string | null;
  contactedAt: string | null;
  closedAt: string | null;
  closedReason: string | null;
  createdAt: string;
  updatedAt: string;
  assignedToId: string | null;
  assignedTo: AssignedAdmin | null;

  // Davet alanları (admin demo görüşmesi sonrası kayıt linki gönderir)
  inviteSentAt: string | null;
  inviteSentToEmail: string | null;
  inviteSentMessage: string | null;
  inviteTokenExpAt: string | null;
  inviteUsedAt: string | null;
  inviteSentCount: number;
  linkedApplicationId: string | null;
}

export interface SendInviteInput {
  email: string;
  message?: string;
}

export interface SendInviteResult {
  sentAt: string;
  sentToEmail: string;
  expiresAt: string;
  sentCount: number;
  message: string;
}

export interface DemoRequestPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface DemoRequestList {
  items: DemoRequest[];
  pagination: DemoRequestPagination;
}

export interface DemoRequestStats {
  total: number;
  byStatus: Partial<Record<DemoRequestStatus, number>>;
}

export interface UpdateDemoRequestInput {
  status?: DemoRequestStatus;
  notes?: string;
  closedReason?: string;
  assignedToId?: string | null;
}

export interface ListDemoRequestsParams {
  status?: DemoRequestStatus;
  search?: string;
  assignedToId?: string;
  page?: number;
  pageSize?: number;
}
