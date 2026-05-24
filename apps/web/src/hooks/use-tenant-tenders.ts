"use client";

import { api } from "@/lib/api";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type {
  BidComparisonResponse,
  BidDetailExpanded,
  ListTendersParams,
  TenderBidsResponse,
  TenderBuyer,
  TenderCategoryFilter,
  TenderDetail,
  TenderListResponse,
  TenderStats,
} from "@/lib/tenders/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["tenant", "tenders"] as const,
  list: (params: ListTendersParams) => [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
  bids: (id: string) => [...KEYS.all, "bids", id] as const,
  bidComparison: (id: string) =>
    [...KEYS.all, "bid-comparison", id] as const,
  bidDetail: (id: string, bidId: string) =>
    [...KEYS.all, "bid-detail", id, bidId] as const,
  filterBuyers: () => [...KEYS.all, "filters", "buyers"] as const,
  filterCategories: () => [...KEYS.all, "filters", "categories"] as const,
};

function buildParams(params: ListTendersParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.sort) p.sort = params.sort;
  if (params.range) p.range = params.range;
  if (params.createdById) p.createdById = params.createdById;
  if (params.categoryId) p.categoryId = params.categoryId;
  if (params.currency) p.currency = params.currency;
  if (params.amountMin != null) p.amountMin = params.amountMin;
  if (params.amountMax != null) p.amountMax = params.amountMax;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

/** İhaleyi açan distinct satın almacı listesi (filter dropdown). */
export function useTenderBuyers() {
  return useQuery({
    queryKey: KEYS.filterBuyers(),
    queryFn: async () => {
      const { data } = await api.get<TenderBuyer[]>(
        "/tenants/me/tenders/filters/buyers",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

/** İhalelerde kullanılmış distinct kategori listesi (filter dropdown). */
export function useTenderCategoryOptions() {
  return useQuery({
    queryKey: KEYS.filterCategories(),
    queryFn: async () => {
      const { data } = await api.get<TenderCategoryFilter[]>(
        "/tenants/me/tenders/filters/categories",
      );
      return data;
    },
    staleTime: 60_000,
  });
}

export function useTenders(params: ListTendersParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<TenderListResponse>(
        "/tenants/me/tenders",
        { params: buildParams(params) },
      );
      return data;
    },
    placeholderData: (prev) => prev,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
    // Performans audit P-7 — Window focus / hızlı tab geçişlerinde anlık
    // refetch'i engelle; refetchInterval zaten 30s'de bir taze veri çekiyor.
    staleTime: 10_000,
  });
}

export function useTenderDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<TenderDetail>(
        `/tenants/me/tenders/${id}`,
      );
      return data;
    },
    enabled: !!id,
    refetchInterval: 15_000,
    refetchIntervalInBackground: false, // P-6
    staleTime: 5_000, // P-7
  });
}

export function useTenderStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<TenderStats>(
        "/tenants/me/tenders/stats",
      );
      return data;
    },
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
    staleTime: 10_000,
  });
}

// ============================================================
// E.4 — Buyer bid monitoring (Teklifler tab)
// ============================================================

export function useTenderBids(
  tenderId: string | null,
  options?: { polling?: boolean },
) {
  return useQuery({
    queryKey: KEYS.bids(tenderId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<TenderBidsResponse>(
        `/tenants/me/tenders/${tenderId}/bids`,
      );
      return data;
    },
    enabled: !!tenderId,
    refetchInterval: options?.polling ? 30_000 : false,
    refetchIntervalInBackground: false, // P-6
    staleTime: 10_000,
  });
}

export function useTenderBidComparison(
  tenderId: string | null,
  options?: { polling?: boolean },
) {
  return useQuery({
    queryKey: KEYS.bidComparison(tenderId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<BidComparisonResponse>(
        `/tenants/me/tenders/${tenderId}/bids/comparison`,
      );
      return data;
    },
    enabled: !!tenderId,
    refetchInterval: options?.polling ? 30_000 : false,
    refetchIntervalInBackground: false, // P-6
    staleTime: 10_000,
  });
}

export function useBidDetail(
  tenderId: string | null,
  bidId: string | null,
) {
  return useQuery({
    queryKey: KEYS.bidDetail(tenderId ?? "", bidId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<BidDetailExpanded>(
        `/tenants/me/tenders/${tenderId}/bids/${bidId}`,
      );
      return data;
    },
    enabled: !!tenderId && !!bidId,
  });
}

// ============================================================
// MUTATIONS — create / update / publish / cancel / delete
// ============================================================

interface CreateTenderResponse {
  id: string;
  tenderNumber: string;
}

function buildPayload(data: TenderFormData) {
  // Empty optional strings → undefined (geriye nullable döner backend'de)
  const sanitize = <T>(v: T | "" | undefined): T | undefined =>
    v === "" || v === undefined ? undefined : v;

  return {
    categoryIds: data.categoryIds,
    title: data.title,
    description: sanitize(data.description),
    type: data.type,
    isSealedBid: data.isSealedBid,
    requireAllItems: data.requireAllItems,
    requireBidDocument: data.requireBidDocument,
    primaryCurrency: data.primaryCurrency,
    allowedCurrencies: data.allowedCurrencies,
    deliveryTerm: data.deliveryTerm,
    billingAddressId: data.billingAddressId,
    deliveryAddressId: data.deliveryAddressId,
    paymentTerm: data.paymentTerm,
    paymentDays:
      data.paymentTerm === "DEFERRED" ? data.paymentDays : undefined,
    termsAndConditions: sanitize(data.termsAndConditions),
    internalNotes: sanitize(data.internalNotes),
    bidsCloseAt: new Date(data.bidsCloseAt).toISOString(),
    bidsOpenAt: data.bidsOpenAt
      ? new Date(data.bidsOpenAt).toISOString()
      : undefined,
    items: data.items.map((it) => ({
      name: it.name,
      description: sanitize(it.description),
      quantity: it.quantity,
      unit: it.unit,
      materialCode: sanitize(it.materialCode),
      requiredByDate: it.requiredByDate
        ? new Date(it.requiredByDate).toISOString()
        : undefined,
      targetUnitPrice: it.targetUnitPrice,
      customQuestion: sanitize(it.customQuestion),
    })),
    invitedSupplierIds: data.invitedSupplierIds,
  };
}

export function useCreateTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TenderFormData) => {
      const { data: res } = await api.post<CreateTenderResponse>(
        "/tenants/me/tenders",
        buildPayload(data),
      );
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateTender(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (data: TenderFormData) => {
      const { data: res } = await api.patch<CreateTenderResponse>(
        `/tenants/me/tenders/${id}`,
        buildPayload(data),
      );
      return res;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(id) });
    },
  });
}

export function usePublishTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{
        id: string;
        tenderNumber: string;
        status: "OPEN_FOR_BIDS";
      }>(`/tenants/me/tenders/${id}/publish`);
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(data.id) });
    },
  });
}

/**
 * V2-7+ — Mevcut ihaleye sonradan tedarikçi davet ekleme.
 */
export function useAddTenderInvitations(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supplierIds: string[]) => {
      const { data } = await api.post<{
        added: number;
        skipped: number;
        invitations: Array<{ id: string; supplierId: string }>;
      }>(`/tenants/me/tenders/${tenderId}/invitations`, { supplierIds });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(tenderId) });
    },
  });
}

export function useCancelTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason: string }) => {
      const { data } = await api.post<{ id: string; status: "CANCELLED" }>(
        `/tenants/me/tenders/${input.id}/cancel`,
        { reason: input.reason },
      );
      return data;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(data.id) });
    },
  });
}

export function useDeleteTender() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ id: string }>(
        `/tenants/me/tenders/${id}`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// ============================================================
// E.5 — Eleme + Kazandırma + close-no-award
// ============================================================

export function useEliminateBid(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { bidId: string; reason: string }) => {
      const { data } = await api.post<{
        id: string;
        status: "LOST";
        version: number;
      }>(`/tenants/me/tenders/${tenderId}/bids/${input.bidId}/eliminate`, {
        reason: input.reason,
      });
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(tenderId) });
      qc.invalidateQueries({ queryKey: KEYS.bids(tenderId) });
      qc.invalidateQueries({ queryKey: KEYS.bidComparison(tenderId) });
      qc.invalidateQueries({
        queryKey: [...KEYS.all, "bid-detail", tenderId],
      });
    },
  });
}

export function useAwardFull(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (bidId: string) => {
      const { data } = await api.post(
        `/tenants/me/tenders/${tenderId}/award/full`,
        { bidId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export interface AwardItemDecision {
  tenderItemId: string;
  bidId: string;
}

export function useAwardItemByItem(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (decisions: AwardItemDecision[]) => {
      const { data } = await api.post(
        `/tenants/me/tenders/${tenderId}/award/item-by-item`,
        { decisions },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useFinalizeAward(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{
        tenderStatus: "AWARDED";
        orderCount: number;
        orders: Array<{ id: string; orderNumber: string }>;
      }>(`/tenants/me/tenders/${tenderId}/award/finalize`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useCloseNoAward(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { reason?: string }) => {
      const { data } = await api.post<{ tenderStatus: "CLOSED_NO_AWARD" }>(
        `/tenants/me/tenders/${tenderId}/close-no-award`,
        input.reason ? { reason: input.reason } : {},
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// Erken kapatma — OPEN_FOR_BIDS → IN_AWARD (alıcı bidsCloseAt'ı beklemiyor)
export function useCloseBiddingEarly(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await api.post<{ tenderStatus: "IN_AWARD" }>(
        `/tenants/me/tenders/${tenderId}/close-bidding`,
        {},
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// V2-7 — Yeni Tur Oluştur
export interface CreateNextRoundPayload {
  type: "RFQ" | "ENGLISH_AUCTION";
  carryBids: "AUTO" | "LAZY" | "NONE";
  eliminateNonBidders: boolean;
  openImmediately: boolean;
  bidsOpenAt?: string;
  bidsCloseAt: string;
  previewBeforeOpen?: boolean;
  autoExtendOnLateBid?: boolean;
}

export function useCreateNextRound(previousTenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateNextRoundPayload) => {
      const { data } = await api.post<{
        id: string;
        tenderNumber: string;
        roundNumber: number;
      }>(`/tenants/me/tenders/${previousTenderId}/next-round`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

// V2-7 — Kapanış zamanını değiştir / ihaleyi hemen kapat (notlu, e-postalı)
export interface ChangeClosingTimePayload {
  closeNow: boolean;
  newCloseAt?: string;
  note: string;
}

export function useChangeClosingTime(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: ChangeClosingTimePayload) => {
      const { data } = await api.patch<{
        status: "OPEN_FOR_BIDS" | "IN_AWARD";
        bidsCloseAt: string;
        notifiedCount: number;
      }>(`/tenants/me/tenders/${tenderId}/closing-time`, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

/**
 * V2-7+ — "Not Al" — alıcı dahili notu günceller.
 */
export function useUpdateTenderNotes(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (internalNotes: string) => {
      const { data } = await api.patch<{ internalNotes: string | null }>(
        `/tenants/me/tenders/${tenderId}/notes`,
        { internalNotes },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.detail(tenderId) });
    },
  });
}

export interface RoundHistoryItem {
  id: string;
  tenderNumber: string;
  title: string;
  status: string;
  type: "RFQ" | "ENGLISH_AUCTION";
  roundNumber: number;
  bidsOpenAt: string | null;
  bidsCloseAt: string;
  publishedAt: string | null;
  previousTenderId: string | null;
  createdAt: string;
}

/**
 * V2-7+ — Tur zinciri (tüm previousTenderId → nextRounds yolu).
 */
export function useRoundHistory(tenderId: string | null) {
  return useQuery({
    queryKey: ["round-history", tenderId],
    enabled: !!tenderId,
    queryFn: async () => {
      const { data } = await api.get<{
        currentId: string;
        rounds: RoundHistoryItem[];
      }>(`/tenants/me/tenders/${tenderId}/round-history`);
      return data;
    },
  });
}

export const tenantTendersQueryKeys = KEYS;
