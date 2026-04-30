"use client";

import { api } from "@/lib/api";
import type {
  DemoRequest,
  DemoRequestList,
  DemoRequestStats,
  ListDemoRequestsParams,
  SendInviteInput,
  SendInviteResult,
  UpdateDemoRequestInput,
} from "@/lib/demo-requests/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  all: ["admin", "demo-requests"] as const,
  list: (params: ListDemoRequestsParams) => [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  stats: () => [...KEYS.all, "stats"] as const,
};

function buildParams(params: ListDemoRequestsParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.assignedToId) p.assignedToId = params.assignedToId;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useDemoRequests(params: ListDemoRequestsParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<DemoRequestList>("/admin/demo-requests", {
        params: buildParams(params),
      });
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useDemoRequestStats() {
  return useQuery({
    queryKey: KEYS.stats(),
    queryFn: async () => {
      const { data } = await api.get<DemoRequestStats>(
        "/admin/demo-requests/stats",
      );
      return data;
    },
    staleTime: 30 * 1000,
  });
}

export function useDemoRequestDetail(id: string | null) {
  return useQuery({
    queryKey: KEYS.detail(id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<DemoRequest>(
        `/admin/demo-requests/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useUpdateDemoRequest(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: UpdateDemoRequestInput) => {
      const { data } = await api.patch<DemoRequest>(
        `/admin/demo-requests/${id}`,
        input,
      );
      return data;
    },
    onSuccess: (data) => {
      queryClient.setQueryData(KEYS.detail(id), data);
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useSendDemoInvite(id: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (input: SendInviteInput) => {
      const { data } = await api.post<SendInviteResult>(
        `/admin/demo-requests/${id}/send-invite`,
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.detail(id) });
      queryClient.invalidateQueries({ queryKey: [...KEYS.all, "list"] });
    },
  });
}

export const demoRequestQueryKeys = KEYS;
