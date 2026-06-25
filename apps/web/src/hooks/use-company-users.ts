"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { CompanyRole } from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CompanyTeamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  roles: CompanyRole[];
  isOwner: boolean;
  isActive: boolean;
}

export interface InviteUserInput {
  email: string;
  firstName: string;
  lastName: string;
  password?: string;
  roles: CompanyRole[];
}

export function useCompanyUsers() {
  return useQuery({
    queryKey: ["company-users"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyTeamUser[]>(
        "/company/users",
      );
      return data;
    },
  });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteUserInput) => {
      const { data } = await companyApi.post("/company/users", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-users"] }),
  });
}

export function useUpdateUserRoles() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, roles }: { id: string; roles: CompanyRole[] }) => {
      const { data } = await companyApi.patch(`/company/users/${id}/roles`, {
        roles,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-users"] }),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(`/company/users/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-users"] }),
  });
}
