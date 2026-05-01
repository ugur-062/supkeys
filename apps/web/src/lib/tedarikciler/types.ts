export type RelationStatus = "ACTIVE" | "PENDING_TENANT_APPROVAL" | "BLOCKED";

export type CompanyType = "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
export type SupplierMembership = "STANDARD" | "PREMIUM";

export type InvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "CANCELLED";

export interface SupplierUserSummary {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone: string | null;
  isActive?: boolean;
}

export interface SupplierSummary {
  id: string;
  companyName: string;
  companyType: CompanyType;
  taxNumber: string;
  taxOffice: string;
  industry: string | null;
  website: string | null;
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;
  membership: SupplierMembership;
  isActive: boolean;
  users: SupplierUserSummary[];
}

export interface SupplierWithRelation {
  relationId: string;
  relationStatus: RelationStatus;
  relationCreatedAt: string;
  blockedAt: string | null;
  blockedReason: string | null;
  supplier: SupplierSummary;
}

export interface SupplierStats {
  total: number;
  active: number;
  blocked: number;
  pending: number;
}

export interface Pagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface SupplierListResponse {
  items: SupplierWithRelation[];
  pagination: Pagination;
}

export interface ListSuppliersParams {
  status?: RelationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface InvitationItem {
  id: string;
  email: string;
  contactName: string | null;
  message: string | null;
  status: InvitationStatus;
  sentCount: number;
  lastSentAt: string;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  invitedByUser: {
    id: string;
    firstName: string;
    lastName: string;
    email: string;
  };
  acceptedBySupplier: { id: string; companyName: string } | null;
}

export interface InvitationListResponse {
  items: InvitationItem[];
  pagination: Pagination;
}

export interface ListInvitationsParams {
  status?: InvitationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface BatchInvitationResult {
  email: string;
  success: boolean;
  invitationId?: string;
  reason?: "ALREADY_INVITED" | "ALREADY_SUPPLIER";
}

export interface BatchInvitationResponse {
  results: BatchInvitationResult[];
  summary: { total: number; success: number; failed: number };
}

export interface BlockSupplierInput {
  reason: string;
}
