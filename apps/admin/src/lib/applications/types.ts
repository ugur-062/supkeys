export type ApplicationStatus =
  | "PENDING_EMAIL_VERIFICATION"
  | "PENDING_REVIEW"
  | "APPROVED"
  | "REJECTED";

export type CompanyType = "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";

export interface ReviewerRef {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
}

export interface TenantRef {
  id: string;
  name: string;
  slug: string;
}

interface ApplicationCommonFields {
  id: string;
  status: ApplicationStatus;

  // Firma
  companyName: string;
  companyType: CompanyType;
  taxNumber: string;
  taxOffice: string;
  taxCertUrl: string;
  industry: string | null;
  website: string | null;

  // Adres
  city: string;
  district: string;
  addressLine: string;
  postalCode: string | null;

  // Yetkili
  adminFirstName: string;
  adminLastName: string;
  adminEmail: string;
  adminPhone: string | null;

  // Süreç
  emailVerifiedAt: string | null;
  reviewedAt: string | null;
  reviewedById: string | null;
  reviewedBy: ReviewerRef | null;
  rejectionReason: string | null;
  ipAddress: string | null;

  createdAt: string;
  updatedAt: string;
}

export interface BuyerApplicationListItem extends ApplicationCommonFields {
  tenantId: string | null;
}

export interface FromDemoRequestRef {
  id: string;
  companyName: string;
  contactName: string;
  email: string;
  status: string;
}

export interface BuyerApplicationDetail extends BuyerApplicationListItem {
  tenant: TenantRef | null;
  fromDemoRequest: FromDemoRequestRef | null;
}

export interface InvitedByTenantRef {
  id: string;
  name: string;
  slug: string;
}

export interface SupplierApplicationListItem extends ApplicationCommonFields {
  invitationId: string | null;
  invitedByTenantId: string | null;
  invitedByTenant: InvitedByTenantRef | null;
  supplierId: string | null;
}

export interface SupplierApplicationDetail extends SupplierApplicationListItem {
  invitation: {
    id: string;
    email: string;
    expiresAt: string;
    status: string;
  } | null;
  supplier: { id: string; companyName: string } | null;
}

export interface ApplicationPagination {
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
}

export interface ApplicationListResponse<T> {
  items: T[];
  pagination: ApplicationPagination;
}

export interface ApplicationStats {
  total: number;
  byStatus: Partial<Record<ApplicationStatus, number>>;
}

export interface ListApplicationsParams {
  status?: ApplicationStatus;
  search?: string;
  page?: number;
  pageSize?: number;
}

export interface RejectApplicationInput {
  reason: string;
}
