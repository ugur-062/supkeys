"use client";

import { api } from "@/lib/api";
import type {
  ApprovalRequestDetail,
  ApprovalRequestListItem,
  ListApprovalRequestsParams,
} from "@/lib/approval-requests/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["approval-requests"] as const,
  list: (params: ListApprovalRequestsParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  pendingCount: () => [...KEYS.all, "pending-count"] as const,
};

function buildQuery(params: ListApprovalRequestsParams): string {
  const search = new URLSearchParams();
  if (params.status) search.set("status", params.status);
  if (params.type) search.set("type", params.type);
  if (params.initiatorUserId) search.set("initiatorUserId", params.initiatorUserId);
  if (params.tenderNumber) search.set("tenderNumber", params.tenderNumber);
  if (params.approvalNumber) search.set("approvalNumber", params.approvalNumber);
  if (params.search) search.set("search", params.search);
  if (params.pendingForMe) search.set("pendingForMe", "true");
  const qs = search.toString();
  return qs ? `?${qs}` : "";
}

export function useApprovalRequests(params: ListApprovalRequestsParams = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<ApprovalRequestListItem[]>(
        `/tenants/me/approval-requests${buildQuery(params)}`,
      );
      return data;
    },
    staleTime: 15_000,
    refetchInterval: 30_000,
    refetchIntervalInBackground: false, // P-6
  });
}

export function useApprovalRequest(id: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApprovalRequestDetail>(
        `/tenants/me/approval-requests/${id}`,
      );
      return data;
    },
    enabled: Boolean(id),
    staleTime: 10_000,
  });
}

export function useApprovalPendingCount() {
  return useQuery({
    queryKey: KEYS.pendingCount(),
    queryFn: async () => {
      const { data } = await api.get<{ count: number }>(
        `/tenants/me/approval-requests/pending-count`,
      );
      return data;
    },
    staleTime: 30_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false, // P-6
  });
}

export function useApproveRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; note?: string }) => {
      const { data } = await api.post<{ status: string }>(
        `/tenants/me/approval-requests/${input.id}/approve`,
        { note: input.note },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["tender"] });
      qc.invalidateQueries({ queryKey: ["tender-list"] });
      qc.invalidateQueries({ queryKey: ["tender-stats"] });
    },
  });
}

export function useRejectRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; note?: string }) => {
      const { data } = await api.post<{ status: string }>(
        `/tenants/me/approval-requests/${input.id}/reject`,
        { note: input.note },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["tender"] });
      qc.invalidateQueries({ queryKey: ["tender-list"] });
      qc.invalidateQueries({ queryKey: ["tender-stats"] });
    },
  });
}

export function useCancelRequest() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; reason?: string }) => {
      const { data } = await api.post<{ status: string }>(
        `/tenants/me/approval-requests/${input.id}/cancel`,
        { reason: input.reason },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: ["tender"] });
      qc.invalidateQueries({ queryKey: ["tender-list"] });
    },
  });
}
