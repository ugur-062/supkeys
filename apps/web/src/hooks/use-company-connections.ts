"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ConnectionOrigin = "INVITE" | "PREMIUM" | "ADMIN";

export interface ConnectionCompany {
  id: string;
  name: string;
  supkeysId: string | null;
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-connections"] }),
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
    mutationFn: async (supkeysId: string) => {
      const { data } = await companyApi.post<{ name: string }>(
        "/company/blocks",
        { supkeysId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-blocks"] });
      qc.invalidateQueries({ queryKey: ["company-connections"] });
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
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-blocks"] }),
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
