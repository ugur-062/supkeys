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
  tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
  membershipEndAt: string | null;
  verification: "UNVERIFIED" | "PENDING" | "VERIFIED" | "REJECTED";
  isBlocked: boolean;
  complaintCount: number;
  userCount: number;
  /** Faz Y: bekleyen belge-güncelleme revizyonu sayısı (A-modeli rozeti). */
  pendingRevisionCount: number;
  createdAt: string;
  /** Kuyruk yaşı için — PENDING'e geçiş/belge yükleme yaklaşık anı. */
  updatedAt: string;
}

export interface AdminCompanyListResponse {
  items: AdminCompanyRow[];
  total: number;
  page: number;
  pageSize: number;
}

export interface AdminCompanyListParams {
  status?: string;
  /** "kyc" → başvuru kuyruğu (PENDING + bekleyen belge-revizyonlular). */
  queue?: string;
  blocked?: string;
  q?: string;
  country?: string;
  tier?: string;
  sort?: "newest" | "oldest";
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
  tierBreakdown: { STANDART: number; BRONZ: number; SILVER: number; GOLD: number };
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
  /** Kayıt hunisi: kayıt → onboarding → KYC belgeleri → doğrulandı. */
  funnel: {
    signedUp: number;
    onboarded: number;
    kycSubmitted: number;
    verified: number;
  };
  /** İlan/ihale panosu — görünürlük ve tip kırılımları YALNIZ yayınlanmışlar üzerinden. */
  listings: {
    total: number;
    published: number;
    draft: number;
    open: number;
    inAward: number;
    awarded: number;
    closedNoAward: number;
    byVisibility: { PUBLIC: number; CONNECTIONS: number; PRIVATE: number };
    byType: { ALIM: number; SATIS: number };
    totalBids: number;
  };
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
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
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
  tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
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
  /** Belge kindi → R2 anahtarı (presigned URL nesneyi tanımlamaz; bkz. #3). */
  docKeys?: Partial<Record<DocKind, string | null>>;
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
  /** Faz Y A-modeli: bekleyen belge-güncelleme revizyonları (presigned önizleme). */
  pendingRevisions: {
    id: string;
    kind: DocKind;
    createdAt: string;
    url: string | null;
  }[];
  /** Firmaya bağlı adreslerden e-posta ALAMAYANLAR (hard-bounce/şikayet).
   *  Boşsa sorun yok. "Giriş yapamıyorum" destek çağrısında bakılır. */
  suppressions: EmailSuppression[];
}

export interface EmailSuppression {
  email: string;
  /** "BOUNCED" (kalıcı/hard) | "COMPLAINED" (şikayet) */
  status: "BOUNCED" | "COMPLAINED";
  reason: string | null;
  at: string;
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
  /**
   * İncelenen nesnenin R2 anahtarı (denetim 2026-08-26 Parça 9 #3). Karar bu
   * nesneye sabitlenir; ekran açıkken firma belgeyi değiştirdiyse API 409
   * döner — admin görmediği bir belgeyi onaylamış olmaz.
   */
  key?: string | null;
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
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
    },
  });
}

/** Faz Y A-modeli — tekil belge-güncelleme revizyonu kararı (onay/red). */
export function useReviewDocRevision() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      revId,
      status,
      reason,
    }: {
      id: string;
      revId: string;
      status: "APPROVED" | "REJECTED";
      reason?: string;
    }) => {
      const { data } = await api.post<{ ok: boolean; status: string }>(
        `/admin/companies/${id}/doc-revisions/${revId}/review`,
        { status, reason },
      );
      return data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
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

/** Firma kimlik bilgisi düzeltme — yalnız gönderilen alanlar değişir. */
export interface CompanyProfilePatch {
  name?: string;
  legalName?: string | null;
  taxNumber?: string | null;
  taxOffice?: string | null;
  mersisNo?: string | null;
  tradeRegistryNo?: string | null;
  country?: string;
  stateRegion?: string | null;
  city?: string | null;
  addressLine?: string | null;
  billingEmail?: string | null;
  website?: string | null;
  industry?: string | null;
  iban?: string | null;
  ibanHolder?: string | null;
}

export function useUpdateCompanyProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      patch,
    }: {
      id: string;
      patch: CompanyProfilePatch;
    }) => {
      const { data } = await api.post<{ ok: boolean; changed: string[] }>(
        `/admin/companies/${id}/profile`,
        patch,
      );
      return data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
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
      reason,
    }: {
      id: string;
      tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
      months?: number;
      reason?: string;
    }) => {
      await api.post(`/admin/companies/${id}/tier`, { tier, months, reason });
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
      qc.invalidateQueries({ queryKey: ["membership-history", id] });
    },
  });
}

/** Ek-süreli uzatma — mevcut bitişe ay EKLER (bitişi sıfırlamaz). */
export function useExtendMembership() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      months,
      reason,
    }: {
      id: string;
      months: number;
      reason?: string;
    }) => {
      const { data } = await api.post<{ ok: boolean; membershipEndAt: string }>(
        `/admin/companies/${id}/membership/extend`,
        { months, reason },
      );
      return data;
    },
    onSuccess: (_d, { id }) => {
      qc.invalidateQueries({ queryKey: ["admin-companies"] });
      qc.invalidateQueries({ queryKey: ["admin-company-detail", id] });
      // Denetim 2026-08-26 Parça 10: doğrulama/KYC/tier aksiyonları panodaki
      // KPI'ları (bekleyen doğrulama, KYC kuyruk yaşı, tier dağılımı) DEĞİŞTİRİR
      // ama tazelemiyordu; kardeş `useResolveComplaint` doğru yapıyordu.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
      qc.invalidateQueries({ queryKey: ["membership-history", id] });
    },
  });
}

export interface MembershipEvent {
  id: string;
  action: "GRANT" | "EXTEND" | "REVOKE" | "EXPIRE";
  months: number | null;
  endBefore: string | null;
  endAfter: string | null;
  reason: string | null;
  adminEmail: string | null;
  createdAt: string;
}

export function useMembershipHistory(id: string) {
  return useQuery({
    queryKey: ["membership-history", id],
    queryFn: async () => {
      const { data } = await api.get<MembershipEvent[]>(
        `/admin/companies/${id}/membership/history`,
      );
      return data;
    },
  });
}

export interface MembershipReportRow {
  id: string;
  companyName: string;
  rothernId: string | null;
  action: "GRANT" | "EXTEND" | "REVOKE" | "EXPIRE";
  months: number | null;
  endAfter: string | null;
  reason: string | null;
  adminEmail: string | null;
  createdAt: string;
}

export interface MembershipReport {
  rows: MembershipReportRow[];
  totals: {
    grants: number;
    extends: number;
    revokes: number;
    expires: number;
    monthsGranted: number;
  };
  /**
   * Liste tavana takıldıysa true (denetim 2026-08-26 Parça 9 #14). TOPLAMLAR
   * her hâlükârda TÜM eşleşen kayıtlardan gelir — kesilen yalnız satır listesi.
   */
  truncated?: boolean;
  totalMatching?: number;
}

export function useMembershipReport(from?: string, to?: string) {
  return useQuery({
    queryKey: ["membership-report", from, to],
    queryFn: async () => {
      const { data } = await api.get<MembershipReport>(
        "/admin/membership/report",
        { params: { ...(from ? { from } : {}), ...(to ? { to } : {}) } },
      );
      return data;
    },
  });
}

export interface AdminComplaint {
  id: string;
  complainant: { id: string; name: string; rothernId: string | null };
  against: { id: string; name: string; rothernId: string | null };
  reason: string;
  detail: string | null;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  adminNote: string | null;
  createdAt: string;
  resolvedAt: string | null;
}

export interface AdminComplaintList {
  items: AdminComplaint[];
  total: number;
  page: number;
  pageSize: number;
}

export function useAdminComplaints(
  status?: string,
  companyId?: string,
  q?: string,
  page?: number,
) {
  return useQuery({
    queryKey: ["admin-complaints", status, companyId, q, page],
    queryFn: async () => {
      const { data } = await api.get<AdminComplaintList>("/admin/complaints", {
        params: {
          ...(status ? { status } : {}),
          ...(companyId ? { companyId } : {}),
          ...(q ? { q } : {}),
          ...(page ? { page } : {}),
        },
      });
      return data;
    },
    placeholderData: (prev) => prev,
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
      // Dashboard "Açık Şikayet" KPI'sı da bu veriden — bayat kalmasın.
      qc.invalidateQueries({ queryKey: ["admin-company-stats"] });
    },
  });
}
