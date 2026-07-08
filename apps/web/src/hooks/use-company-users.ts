"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { CompanyRole } from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CompanyTeamUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
  phone: string | null;
  roles: CompanyRole[];
  isOwner: boolean;
  isActive: boolean;
  lastLoginAt: string | null;
  // Rol-varsayılan izinleri + kişi-bazlı override (UI toggle hesabı).
  rolePermissions: string[];
  permissionsOverride: { added: string[]; removed: string[] };
}

export interface PermissionCatalogItem {
  key: string;
  label: string;
  group: string;
}

export interface PermissionCatalog {
  catalog: PermissionCatalogItem[];
  roleDefaults: Record<CompanyRole, string[]>;
}

/** Token'lı davet — hesap kabulde açılır; admin yalnızca e-posta + rol girer. */
export interface InviteUserInput {
  email: string;
  roles: CompanyRole[];
}

export interface PendingInvitation {
  id: string;
  email: string;
  roles: CompanyRole[];
  status: "PENDING" | "EXPIRED";
  expiresAt: string;
  invitedByName: string;
  createdAt: string;
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
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-invitations"] }),
  });
}

export function useCompanyInvitations(enabled = true) {
  return useQuery({
    queryKey: ["company-invitations"],
    queryFn: async () => {
      const { data } = await companyApi.get<PendingInvitation[]>(
        "/company/users/invitations",
      );
      return data;
    },
    enabled,
  });
}

export function useCancelInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(
        `/company/users/invitations/${id}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-invitations"] }),
  });
}

export function useResendInvitation() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.post(
        `/company/users/invitations/${id}/resend`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-invitations"] }),
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

export function usePermissionCatalog() {
  return useQuery({
    queryKey: ["company-users", "permission-catalog"],
    queryFn: async () => {
      const { data } = await companyApi.get<PermissionCatalog>(
        "/company/users/permission-catalog",
      );
      return data;
    },
    staleTime: 60 * 60 * 1000,
  });
}

export function useUpdateUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      added,
      removed,
    }: {
      id: string;
      added: string[];
      removed: string[];
    }) => {
      const { data } = await companyApi.patch(
        `/company/users/${id}/permissions`,
        { added, removed },
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-users"] }),
  });
}

export function useUpdateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: {
      id: string;
      firstName?: string;
      lastName?: string;
      phone?: string;
      roles?: CompanyRole[];
      // Kuruculuk devrinde eski Kurucu'nun yeni rolü.
      previousOwnerRoles?: CompanyRole[];
    }) => {
      const { data } = await companyApi.patch(`/company/users/${id}`, payload);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-users"] }),
  });
}

export function useSetUserActive() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, active }: { id: string; active: boolean }) => {
      const { data } = await companyApi.patch(`/company/users/${id}/active`, {
        active,
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
