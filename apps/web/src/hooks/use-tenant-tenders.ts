"use client";

import { api } from "@/lib/api";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import type {
  ListTendersParams,
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
};

function buildParams(params: ListTendersParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
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
    staleTime: 10_000,
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
    title: data.title,
    description: sanitize(data.description),
    type: data.type,
    isSealedBid: data.isSealedBid,
    requireAllItems: data.requireAllItems,
    requireBidDocument: data.requireBidDocument,
    primaryCurrency: data.primaryCurrency,
    allowedCurrencies: data.allowedCurrencies,
    decimalPlaces: data.decimalPlaces,
    deliveryTerm: data.deliveryTerm,
    deliveryAddress: sanitize(data.deliveryAddress),
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
    attachments:
      data.attachments && data.attachments.length > 0
        ? data.attachments
        : undefined,
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

export const tenantTendersQueryKeys = KEYS;
