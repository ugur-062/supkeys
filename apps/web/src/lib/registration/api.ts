import { api } from "@/lib/api";

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
