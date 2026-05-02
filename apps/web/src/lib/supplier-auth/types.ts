export type CompanyType = "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR";
export type SupplierMembership = "STANDARD" | "PREMIUM";
export type SupplierRelationStatus =
  | "ACTIVE"
  | "PENDING_TENANT_APPROVAL"
  | "BLOCKED";

export interface SupplierUserDto {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  lastLoginAt: string | null;
}

export interface SupplierProfile {
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
  isBlocked: boolean;
}

export interface SupplierTenantRelation {
  id: string;
  tenantId: string;
  tenantName: string;
  tenantSlug: string;
  status: SupplierRelationStatus;
  blockedAt: string | null;
  blockedReason: string | null;
  createdAt: string;
}

export interface SupplierLoginResponse {
  token: string;
  supplierUser: SupplierUserDto;
  supplier: SupplierProfile;
}

export interface SupplierMeResponse {
  supplierUser: SupplierUserDto;
  supplier: SupplierProfile;
  tenantRelations: SupplierTenantRelation[];
}
