import type { UserRole } from "@/lib/auth/types";

export type UserInvitationStatus =
  | "PENDING"
  | "ACCEPTED"
  | "EXPIRED"
  | "CANCELLED";

export interface TenantUserListItem {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  invitedAt: string | null;
  /** V2-6.5 — RBAC efektif permission listesi */
  permissions?: string[];
  hasCustomPermissions?: boolean;
}

export interface TenantUserMe {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  role: UserRole;
  isActive: boolean;
  notificationPrefs: Record<string, boolean> | null;
  lastLoginAt: string | null;
  createdAt: string;
  tenant: {
    id: string;
    name: string;
    slug: string;
    taxNumber: string | null;
    taxOffice: string | null;
    industry: string | null;
    city: string | null;
    district: string | null;
    addressLine: string | null;
    postalCode: string | null;
    /** V2-6 — buyerApplication'dan düzleştirilmiş */
    companyType: "JOINT_STOCK" | "LIMITED" | "SOLE_PROPRIETOR" | null;
    taxCertUrl: string | null;
  };
}

export interface TenantInvitation {
  id: string;
  tenantId: string;
  email: string;
  role: UserRole;
  status: UserInvitationStatus;
  expiresAt: string;
  acceptedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  invitedBy: {
    firstName: string;
    lastName: string;
    email: string;
  };
}

export interface InviteUserPayload {
  email: string;
  role: UserRole;
}

export interface UpdateUserPayload {
  firstName?: string;
  lastName?: string;
  phone?: string;
  role?: UserRole;
  isActive?: boolean;
  /** V2-6.5 — null = saf default; obje verirseniz added/removed listeleri kabul edilir */
  permissionsOverride?: {
    added?: string[];
    removed?: string[];
  } | null;
}

export interface ChangePasswordPayload {
  currentPassword: string;
  newPassword: string;
}

export interface AcceptInvitationPayload {
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
}

export interface PublicInvitationInfo {
  email: string;
  role: UserRole;
  tenantName: string;
  expiresAt: string;
}
