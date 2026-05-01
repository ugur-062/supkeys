"use client";

import { api } from "@/lib/api";
import type {
  BatchInvitationResponse,
  InvitationItem,
  InvitationListResponse,
  ListInvitationsParams,
} from "@/lib/tedarikciler/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  all: ["tenant", "supplier-invitations"] as const,
  list: (params: ListInvitationsParams) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
  preview: (input: { contactName?: string; message?: string }) =>
    [...KEYS.all, "preview", input] as const,
};

function buildParams(params: ListInvitationsParams) {
  const p: Record<string, string | number> = {};
  if (params.status) p.status = params.status;
  if (params.search) p.search = params.search;
  if (params.page) p.page = params.page;
  if (params.pageSize) p.pageSize = params.pageSize;
  return p;
}

export function useInvitations(params: ListInvitationsParams) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const { data } = await api.get<InvitationListResponse>(
        "/tenants/me/supplier-invitations",
        { params: buildParams(params) },
      );
      return data;
    },
    placeholderData: (prev) => prev,
  });
}

export function useBatchInvitations() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      emails: string[];
      contactName?: string;
      message?: string;
    }) => {
      const { data } = await api.post<BatchInvitationResponse>(
        "/tenants/me/supplier-invitations/batch",
        input,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useResendInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{
        id: string;
        sentCount: number;
        expiresAt: string;
        message: string;
      }>(`/tenants/me/supplier-invitations/${id}/resend`);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useCancelInvitation() {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<{ message: string }>(
        `/tenants/me/supplier-invitations/${id}/cancel`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

interface PreviewInput {
  contactName?: string;
  message?: string;
  enabled: boolean;
}

export function useInvitationPreview({
  contactName,
  message,
  enabled,
}: PreviewInput) {
  return useQuery({
    queryKey: KEYS.preview({ contactName, message }),
    queryFn: async () => {
      const { data } = await api.post<{ html: string; subject: string }>(
        "/tenants/me/supplier-invitations/preview",
        {
          contactName: contactName?.trim() || undefined,
          message: message?.trim() || undefined,
        },
      );
      return data;
    },
    enabled,
    staleTime: 60 * 1000,
  });
}

export const supplierInvitationsQueryKeys = KEYS;

export interface InvitationDetailLike extends InvitationItem {}
