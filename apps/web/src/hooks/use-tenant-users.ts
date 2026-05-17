"use client";

import { api } from "@/lib/api";
import type {
  ChangePasswordPayload,
  InviteUserPayload,
  TenantInvitation,
  TenantUserListItem,
  TenantUserMe,
  UpdateUserPayload,
} from "@/lib/users/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["tenant-users"] as const,
  list: () => [...KEYS.all, "list"] as const,
  me: () => [...KEYS.all, "me"] as const,
  invitations: () => [...KEYS.all, "invitations"] as const,
  buyerSeats: () => [...KEYS.all, "buyer-seats"] as const,
};

export interface BuyerSeatUsage {
  active: number;
  pending: number;
  used: number;
  limit: number;
  available: number;
}

export function useBuyerSeatUsage() {
  return useQuery({
    queryKey: KEYS.buyerSeats(),
    queryFn: async () => {
      const { data } = await api.get<BuyerSeatUsage>(
        "/tenants/me/users/buyer-seats",
      );
      return data;
    },
    staleTime: 15_000,
  });
}

export function useTenantUsers() {
  return useQuery({
    queryKey: KEYS.list(),
    queryFn: async () => {
      const { data } = await api.get<TenantUserListItem[]>(
        "/tenants/me/users",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useTenantUserMe() {
  return useQuery({
    queryKey: KEYS.me(),
    queryFn: async () => {
      const { data } = await api.get<TenantUserMe>("/tenants/me/users/me");
      return data;
    },
    staleTime: 30_000,
  });
}

export function useUpdateMe() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateUserPayload) => {
      const { data } = await api.patch("/tenants/me/users/me", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me() });
      qc.invalidateQueries({ queryKey: KEYS.list() });
    },
  });
}

export function useChangePassword() {
  return useMutation({
    mutationFn: async (payload: ChangePasswordPayload) => {
      const { data } = await api.post(
        "/tenants/me/users/change-password",
        payload,
      );
      return data;
    },
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; payload: UpdateUserPayload }) => {
      const { data } = await api.patch(
        `/tenants/me/users/${input.id}`,
        input.payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.buyerSeats() });
    },
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: InviteUserPayload) => {
      const { data } = await api.post("/tenants/me/users/invite", payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.invitations() });
      qc.invalidateQueries({ queryKey: KEYS.list() });
      qc.invalidateQueries({ queryKey: KEYS.buyerSeats() });
    },
  });
}

export function useTenantInvitations() {
  return useQuery({
    queryKey: KEYS.invitations(),
    queryFn: async () => {
      const { data } = await api.get<TenantInvitation[]>(
        "/tenants/me/users/invitations",
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useCancelInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(
        `/tenants/me/users/invitations/${id}`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.invitations() });
      qc.invalidateQueries({ queryKey: KEYS.buyerSeats() });
    },
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post(
        `/tenants/me/users/invitations/${id}/resend`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.invitations() });
    },
  });
}

export function useUpdateNotificationPrefs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (prefs: Record<string, boolean>) => {
      const { data } = await api.patch(
        "/tenants/me/users/me/notification-prefs",
        { prefs },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.me() });
    },
  });
}

export const tenantUsersQueryKeys = KEYS;
