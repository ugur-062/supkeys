"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminCompanyRow {
  id: string;
  rothernId: string | null;
  name: string;
  taxNumber: string | null;
  country: string;
  stateRegion: string | null;
  city: string | null;
  tier: "STANDARD" | "PAKET";
  membershipEndAt: string | null;
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  isBlocked: boolean;
  complaintCount: number;
  userCount: number;
  createdAt: string;
}

export interface AdminCompanyListResponse {
  items: AdminCompanyRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCompanyListParams {
  status?: string;
  blocked?: string;
  q?: string;
  country?: string;
  tier?: string;
  page?: number;
  pageSize?: number;
}

/** Sayfalı firma listesi — eski 200 kayıt tavanı kalktı. */
export function useAdminCompanies(params: AdminCompanyListParams) {
  return useQuery({
    queryKey: ["admin-companies", params],
    queryFn: async () => {
      const { data } = await api.get<AdminCompanyListResponse>(
        "/admin/companies",
        { params },
      );
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export interface AdminCompanyStats {
  totalCompanies: number;
  verified: number;
  pendingKyc: number;
  pendingReview: number;
  rejected: number;
  openComplaints: number;
  tierBreakdown: { PAKET: number; STANDARD: number };
  countryBreakdown: { country: string; count: number }[];
  last30Days: {
    newCompanies: number;
    newListings: number;
    newOrders: number;
  };
  expiringMemberships: {
    id: string;
    name: string;
    rothernId: string | null;
    membershipEndAt: string;
  }[];
  oldestPendingSince: string | null;
}

/** Dashboard KPI'ları — server-side count/groupBy (200-limitten bağımsız). */
export function useAdminCompanyStats() {
  return useQuery({
    queryKey: ["admin-company-stats"],
    queryFn: async () => {
      const { data } = await api.get<AdminCompanyStats>(
        "/admin/companies/stats",
      );
      return data;
    },
  });
}

export function useCompanyAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      reason,
    }: {
      id: string;
      action: "verify" | "reject" | "suspend" | "unsuspend";
      reason?: string;
    }) => {
      await api.post(
        `/admin/companies/${id}/${action}`,
        action === "suspend" || action === "reject" ? { reason } : {},
      );
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
    },
  });
}

export interface AdminCompanyDetail {
  id: string;
  rothernId: string | null;
  name: string;
  legalName: string | null;
  taxNumber: string | null;
  taxOffice: string | null;
  country: string;
  stateRegion: string | null;
  city: string | null;
  addressLine: string | null;
  billingEmail: string | null;
  tier: "STANDARD" | "PAKET";
  membershipEndAt: string | null;
  industry: string | null;
  website: string | null;
  companyVerificationStatus:
    | "UNVERIFIED"
    | "PENDING"
    | "VERIFIED"
    | "REJECTED";
  companyVerifiedAt: string | null;
  companyRejectionReason: string | null;
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  iban: string | null;
  ibanHolder: string | null;
  docTaxPlateUrl: string | null;
  docTaxPlateStatus: DocStatus;
  docTaxPlateReason: string | null;
  docTradeRegistryUrl: string | null;
  docTradeRegistryStatus: DocStatus;
  docTradeRegistryReason: string | null;
  docSignatureCircularUrl: string | null;
  docSignatureCircularStatus: DocStatus;
  docSignatureCircularReason: string | null;
  docActivityCertUrl: string | null;
  docActivityCertStatus: DocStatus;
  docActivityCertReason: string | null;
  docIdFrontUrl: string | null;
  docIdFrontStatus: DocStatus;
  docIdFrontReason: string | null;
  docIdBackUrl: string | null;
  docIdBackStatus: DocStatus;
  docIdBackReason: string | null;
  isBlocked: boolean;
  blockedReason: string | null;
  blockedAt: string | null;
  createdAt: string;
  _count: { users: number; listings: number; complaintsReceived: number };
  openComplaints: number;
}

// Belge türü (admin inceleme) + belge bazlı inceleme durumu.
export type DocKind =
  | "taxPlate"
  | "tradeRegistry"
  | "signatureCircular"
  | "activityCert"
  | "idFront"
  | "idBack";
export type DocStatus = "PENDING" | "APPROVED" | "REJECTED";
export interface DocDecision {
  status: "APPROVED" | "REJECTED";
  reason?: string;
}

/** Belge bazlı inceleme kararlarını kaydeder (onayla/reddet). */
export function useReviewDocuments() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      decisions,
    }: {
      id: string;
      decisions: Partial<Record<DocKind, DocDecision>>;
    }) => {
      const { data } = await api.post<{ ok: boolean; status: string }>(
        `/admin/companies/${id}/review`,
        { decisions },
      );
      return data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
    },
  });
}

/** Firma detayı — KYC belgeleri (presigned) + kimlik bilgileri. Modal açıkken. */
export function useCompanyDetail(id: string | null) {
  return useQuery({
    queryKey: ["admin-company-detail", id],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<AdminCompanyDetail>(
        `/admin/companies/${id}`,
      );
      return data;
    },
  });
}

export function useSetCompanyTier() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      tier,
      months,
    }: {
      id: string;
      tier: "STANDARD" | "PAKET";
      months?: number;
    }) => {
      await api.post(`/admin/companies/${id}/tier`, { tier, months });
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["admin-companies"] }),
  });
}

export interface AdminComplaint {
  id: string;
  complainant: { name: string; rothernId: string | null };
  against: { id: string; name: string; rothernId: string | null };
  reason: string;
  detail: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export function useAdminComplaints(status?: string, companyId?: string) {
  return useQuery({
    queryKey: ["admin-complaints", status, companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminComplaint[]>("/admin/complaints", {
        params: {
          ...(status ? { status } : {}),
          ...(companyId ? { companyId } : {}),
        },
      });
      return data;
    },
  });
}

export function useResolveComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      status: "RESOLVED" | "DISMISSED";
      adminNote?: string;
      suspend?: boolean;
    }) => {
      const { id, ...body } = input;
      await api.post(`/admin/complaints/${id}/resolve`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-complaints"] });
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
    },
  });
}
