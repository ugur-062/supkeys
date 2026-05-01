import { api } from "@/lib/api";
import type { FullRegistration } from "./schemas";

export type RegistrationKind = "buyer" | "supplier";

export interface BuyerInvitationInfo {
  companyName: string | null;
  contactName: string | null;
  email: string | null;
  message: string | null;
  expiresAt: string;
}

export interface SupplierInvitationInfo {
  tenantName: string;
  email: string;
  contactName: string | null;
  message: string | null;
  expiresAt: string;
}

export interface CreateApplicationResponse {
  id: string;
  message: string;
  expiresAt: string;
  fromDemoInvite?: boolean;
}

export interface VerifyEmailResponse {
  message: string;
  applicationId: string;
  type: RegistrationKind;
}

function buildPayload(values: FullRegistration) {
  // Backend DTO ayrı acceptTerms + acceptKvkk bekliyor; UI tek onay kutusunu
  // her iki bayrağa da map eder (KVKK ve Hizmet Şartları ortak onaylanır).
  return {
    companyName: values.companyName.trim(),
    companyType: values.companyType,
    taxNumber: values.taxNumber.trim(),
    taxOffice: values.taxOffice.trim(),
    taxCertUrl: values.taxCertUrl,
    industry: values.industry?.trim() || undefined,
    website: values.website?.trim() || undefined,
    city: values.city.trim(),
    district: values.district.trim(),
    addressLine: values.addressLine.trim(),
    postalCode: values.postalCode?.trim() || undefined,
    adminFirstName: values.adminFirstName.trim(),
    adminLastName: values.adminLastName.trim(),
    adminEmail: values.adminEmail.trim().toLowerCase(),
    adminPhone: values.adminPhone?.trim() || undefined,
    password: values.password,
    acceptTerms: values.termsAccepted,
    acceptKvkk: values.termsAccepted,
  };
}

export async function fetchBuyerInvitationInfo(token: string) {
  const { data } = await api.get<BuyerInvitationInfo>(
    `/registration/buyer/invitation-info`,
    { params: { token } },
  );
  return data;
}

export async function fetchSupplierInvitationInfo(token: string) {
  const { data } = await api.get<SupplierInvitationInfo>(
    `/registration/supplier/invitation-info`,
    { params: { token } },
  );
  return data;
}

export async function submitBuyerApplication(
  values: FullRegistration,
  invitationToken?: string,
) {
  const url = "/registration/buyer/applications";
  const params = invitationToken ? { invitation: invitationToken } : undefined;
  const { data } = await api.post<CreateApplicationResponse>(
    url,
    buildPayload(values),
    { params },
  );
  return data;
}

export async function submitSupplierApplication(
  values: FullRegistration,
  invitationToken?: string,
) {
  const url = "/registration/supplier/applications";
  const params = invitationToken ? { invitation: invitationToken } : undefined;
  const { data } = await api.post<CreateApplicationResponse>(
    url,
    buildPayload(values),
    { params },
  );
  return data;
}

export async function verifyEmail(token: string, type: RegistrationKind) {
  const { data } = await api.post<VerifyEmailResponse>(
    "/registration/verify-email",
    { token, type },
  );
  return data;
}
