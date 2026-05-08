"use client";

import { api } from "@/lib/api";
import type {
  ApprovalFlow,
  ApprovalFlowStatus,
  CreateApprovalFlowPayload,
  ListApprovalFlowsParams,
  UpdateApprovalFlowPayload,
} from "@/lib/approval-flows/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["approval-flows"] as const,
  list: (params: ListApprovalFlowsParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

export function useApprovalFlows(params: ListApprovalFlowsParams = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.type) search.set("type", params.type);
      if (params.status) search.set("status", params.status);
      const qs = search.toString();
      const { data } = await api.get<ApprovalFlow[]>(
        `/tenants/me/approval-flows${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useApprovalFlow(id: string | null | undefined) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<ApprovalFlow>(
        `/tenants/me/approval-flows/${id}`,
      );
      return data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export function useCreateApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateApprovalFlowPayload) => {
      const { data } = await api.post<ApprovalFlow>(
        "/tenants/me/approval-flows",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      id: string;
      payload: UpdateApprovalFlowPayload;
    }) => {
      const { data } = await api.patch<ApprovalFlow>(
        `/tenants/me/approval-flows/${input.id}`,
        input.payload,
      );
      return data;
    },
    onSuccess: (_, vars) => {
      qc.invalidateQueries({ queryKey: KEYS.all });
      qc.invalidateQueries({ queryKey: KEYS.detail(vars.id) });
    },
  });
}

export function useChangeApprovalFlowStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; status: ApprovalFlowStatus }) => {
      const { data } = await api.patch<ApprovalFlow>(
        `/tenants/me/approval-flows/${input.id}/status`,
        { status: input.status },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDuplicateApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<ApprovalFlow>(
        `/tenants/me/approval-flows/${id}/duplicate`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/tenants/me/approval-flows/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const approvalFlowsQueryKeys = KEYS;
