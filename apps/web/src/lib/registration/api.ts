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
    // G9 madde 27 — KYC belgeleri (varsa gönderilir; connect'te zorunlu)
    ticariSicilUrl: values.ticariSicilUrl || undefined,
    imzaSirkuleriUrl: values.imzaSirkuleriUrl || undefined,
    bankaOnayliIbanUrl: values.bankaOnayliIbanUrl || undefined,
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
  invitationToken: string | undefined,
  // V2-6 — Tedarikçi kategori seçimi (Family seviyesi). Backend zorunlu kabul eder.
  categoryIds: string[],
  // "Tedarikçi Ol" — alıcı public profilinden başvuruda hedef firma slug'ı.
  connectSlug?: string,
) {
  const url = "/registration/supplier/applications";
  const params = invitationToken
    ? { invitation: invitationToken }
    : connectSlug
      ? { connect: connectSlug }
      : undefined;
  const payload = { ...buildPayload(values), categoryIds };
  const { data } = await api.post<CreateApplicationResponse>(url, payload, {
    params,
  });
  return data;
}

export async function verifyEmail(token: string, type: RegistrationKind) {
  const { data } = await api.post<VerifyEmailResponse>(
    "/registration/verify-email",
    { token, type },
  );
  return data;
}

// Madde 29 — tedarikçi signup (önce hesap) + e-posta kod doğrulama.
export interface SupplierSignupInput {
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  password: string;
  // Alıcı davet linki (?invitation=) → otomatik ACTIVE bağlantı.
  invitationToken?: string;
  // "Tedarikçi Ol" public profil (?connect=slug) → PENDING_TENANT_APPROVAL.
  connectSlug?: string;
}

export async function supplierSignup(input: SupplierSignupInput) {
  const { data } = await api.post<{
    challengeId: string;
    expiresAt: string;
    email: string;
  }>("/registration/supplier/signup", input);
  return data;
}

export async function verifySupplierEmail(challengeId: string, code: string) {
  const { data } = await api.post<{ ok: true }>(
    "/registration/supplier/verify-email",
    { challengeId, code },
  );
  return data;
}

export async function resendSupplierCode(challengeId: string) {
  const { data } = await api.post<{ challengeId: string; expiresAt: string }>(
    "/registration/supplier/resend-code",
    { challengeId },
  );
  return data;
}

// Madde 29 — alıcı signup (admin davet linki ile) + e-posta kod doğrulama.
export interface BuyerSignupInput {
  invitationToken: string;
  firstName: string;
  lastName: string;
  phone?: string;
  password: string;
}

export async function buyerSignup(input: BuyerSignupInput) {
  const { data } = await api.post<{
    challengeId: string;
    expiresAt: string;
    email: string;
  }>("/registration/buyer/signup", input);
  return data;
}

export async function verifyBuyerEmail(challengeId: string, code: string) {
  const { data } = await api.post<{ ok: true }>(
    "/registration/buyer/verify-email",
    { challengeId, code },
  );
  return data;
}

export async function resendBuyerCode(challengeId: string) {
  const { data } = await api.post<{ challengeId: string; expiresAt: string }>(
    "/registration/buyer/resend-code",
    { challengeId },
  );
  return data;
}
