"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

export interface ConnectionCompany {
  id: string;
  name: string;
  supkeysId: string | null;
  // İhale daveti adımı için zengin kart alanları (yalnızca bağlantı listesinde dolu).
  tier?: "STANDARD" | "PAKET";
  taxNumber?: string | null;
  city?: string | null;
  country?: string | null;
  industry?: string | null;
  contactName?: string | null;
  contactEmail?: string | null;
}

export interface Connection {
  connectionId: string;
  origin: ConnectionOrigin;
  company: ConnectionCompany;
  decidedAt: string | null;
}

export interface IncomingInvite {
  connectionId: string;
  company: ConnectionCompany;
  createdAt: string;
}

export interface ConnectionSelf {
  rothernId: string | null;
}

export function useConnectionSelf() {
  return useQuery({
    queryKey: ["company-connections", "self"],
    queryFn: async () => {
      const { data } = await companyApi.get<ConnectionSelf>(
        "/company/connections/self",
      );
      return data;
    },
  });
}

export interface ReferralInviteRow {
  id: string;
  email: string;
  createdAt: string;
}

export function useReferralInvites() {
  return useQuery({
    queryKey: ["company-connections", "referral-invites"],
    queryFn: async () => {
      const { data } = await companyApi.get<ReferralInviteRow[]>(
        "/company/connections/referral-invites",
      );
      return data;
    },
  });
}

export function useInviteByEmail() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (email: string) => {
      const { data } = await companyApi.post<{
        kind: "request" | "invited";
        targetName?: string;
        email?: string;
      }>("/company/connections/invite-by-email", { email });
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}

export function useConnections() {
  return useQuery({
    queryKey: ["company-connections", "active"],
    queryFn: async () => {
      const { data } = await companyApi.get<Connection[]>(
        "/company/connections",
      );
      return data;
    },
  });
}

export function useOutgoingInvites() {
  return useQuery({
    queryKey: ["company-connections", "outgoing"],
    queryFn: async () => {
      const { data } = await companyApi.get<IncomingInvite[]>(
        "/company/connections/outgoing",
      );
      return data;
    },
  });
}

export function useCancelReferralInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(
        `/company/connections/referral-invites/${id}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}

export function useIncomingInvites() {
  return useQuery({
    queryKey: ["company-connections", "incoming"],
    queryFn: async () => {
      const { data } = await companyApi.get<IncomingInvite[]>(
        "/company/connections/incoming",
      );
      return data;
    },
  });
}

export interface DiscoverCompany {
  id: string;
  name: string;
  supkeysId: string | null;
  industry: string | null;
  matchScore: number;
}

export function useDiscover() {
  return useQuery({
    queryKey: ["company-connections", "discover"],
    queryFn: async () => {
      const { data } = await companyApi.get<{
        locked: boolean;
        companies: DiscoverCompany[];
      }>("/company/connections/discover");
      return data;
    },
  });
}

export function useInviteConnection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supkeysId: string) => {
      const { data } = await companyApi.post<{ targetName: string }>(
        "/company/connections/invite",
        { supkeysId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      // Profil/arama kartlarındaki bağlantı durumu da bayatlamasın.
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export interface BlockedCompany {
  company: ConnectionCompany;
  createdAt: string;
}

export function useBlocks() {
  return useQuery({
    queryKey: ["company-blocks"],
    queryFn: async () => {
      const { data } = await companyApi.get<BlockedCompany[]>(
        "/company/blocks",
      );
      return data;
    },
  });
}

export function useBlockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      supkeysId,
      reason,
    }: {
      supkeysId: string;
      reason?: string;
    }) => {
      const { data } = await companyApi.post<{ name: string }>(
        "/company/blocks",
        { supkeysId, reason },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-blocks"] });
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useUnblockCompany() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (companyId: string) => {
      const { data } = await companyApi.delete(`/company/blocks/${companyId}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-blocks"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useDisconnect() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (connectionId: string) => {
      const { data } = await companyApi.post(
        `/company/connections/${connectionId}/disconnect`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-connections"] });
      qc.invalidateQueries({ queryKey: ["company-directory"] });
    },
  });
}

export function useRespondInvite() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      connectionId,
      action,
    }: {
      connectionId: string;
      action: "accept" | "reject";
    }) => {
      const { data } = await companyApi.post(
        `/company/connections/${connectionId}/${action}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
  });
}
