"use client";

// Ekip — tedarikçi çalışan davetleri + üye yönetimi.

import { supplierApi } from "@/lib/supplier-auth/api";
import type { SupplierLoginResponse } from "@/lib/supplier-auth/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

const KEYS = {
  members: ["supplier-team", "members"] as const,
  invitations: ["supplier-team", "invitations"] as const,
};

export interface TeamMember {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  isActive: boolean;
  lastLoginAt: string | null;
  createdAt: string;
  isYou: boolean;
}

export interface TeamInvitation {
  id: string;
  email: string;
  status: string;
  expiresAt: string;
  createdAt: string;
  invitedBy: { firstName: string; lastName: string };
}

export function useTeamMembers() {
  return useQuery({
    queryKey: KEYS.members,
    queryFn: async () => {
      const { data } = await supplierApi.get<TeamMember[]>(
        "/supplier-account/team",
      );
      return data;
    },
  });
}

export function useTeamInvitations() {
  return useQuery({
    queryKey: KEYS.invitations,
    queryFn: async () => {
      const { data } = await supplierApi.get<TeamInvitation[]>(
        "/supplier-account/team/invitations",
      );
      return data;
    },
  });
}

export function useInviteTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await supplierApi.post(
        "/supplier-account/team/invite",
        { email },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.invitations }),
  });
}

export function useResendTeamInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supplierApi.post(
        `/supplier-account/team/invitations/${id}/resend`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.invitations }),
  });
}

export function useRevokeTeamInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supplierApi.delete(
        `/supplier-account/team/invitations/${id}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.invitations }),
  });
}

export function useRemoveTeamMember() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await supplierApi.delete(
        `/supplier-account/team/${id}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.members }),
  });
}

// ----------------- PUBLIC: davet kabul -----------------

export interface TeamInvitationInfo {
  email: string;
  companyName: string;
  expiresAt: string;
}

export function useSupplierInvitation(token: string) {
  return useQuery({
    queryKey: ["supplier-invitation", token],
    enabled: !!token,
    retry: false,
    queryFn: async () => {
      const { data } = await supplierApi.get<TeamInvitationInfo>(
        `/supplier-invitations/${token}`,
      );
      return data;
    },
  });
}

export interface AcceptSupplierInvitationPayload {
  firstName: string;
  lastName: string;
  password: string;
  phone?: string;
}

export function useAcceptSupplierInvitation() {
  return useMutation({
    mutationFn: async (input: {
      token: string;
      payload: AcceptSupplierInvitationPayload;
    }) => {
      const { data } = await supplierApi.post<SupplierLoginResponse>(
        `/supplier-invitations/${input.token}/accept`,
        input.payload,
      );
      return data;
    },
  });
}
