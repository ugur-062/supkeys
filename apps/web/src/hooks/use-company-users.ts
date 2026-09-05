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
  /** Efektif izin listesi (yetki tablosu; kurucu örtük izinleri dahil). */
  permissions?: string[];
  /** Hazır setten sapmış (kişiye özel tik) — listede "Özel" rozeti. */
  custom?: boolean;
  // Rol-varsayılan izinleri + kişi-bazlı fark (UI toggle hesabı).
  rolePermissions: string[];
  permissionsOverride: { added: string[]; removed: string[] };
}

export interface PermissionCatalogItem {
  key: string;
  label: string;
  group: "buy" | "sell" | "approval" | "management";
  /** İşlem izni — koltuk tüketir. */
  seat: boolean;
  /** Yalnız Kurucu verir ("Kullanıcı ve yetki"). */
  ownerGrantsOnly?: boolean;
}

export interface PermissionCatalog {
  catalog: PermissionCatalogItem[];
  groups: Record<PermissionCatalogItem["group"], string>;
  /** Rol çipleri + Görüntüleyici hazır setleri. */
  presets: Record<
    "SATIN_ALMACI" | "SATISCI" | "ONAYLAYICI" | "YONETICI" | "GORUNTULEYICI",
    string[]
  >;
  roleDefaults: Record<CompanyRole, string[]>;
}

/** Token'lı davet — hesap kabulde açılır; admin yalnızca e-posta + rol girer. */
export interface InviteUserInput {
  email: string;
  /** Yetki tablosu (Faz 4): açık izin listesi; verilirse roller yok sayılır. */
  permissions?: string[];
  roles?: CompanyRole[];
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

/**
 * Kullanıcı/davet mutasyonlarının ortak invalidasyonu.
 *
 * Denetim 2026-08-26 Parça 10: koltuk sayacı (`company-seats`) YALNIZ
 * seat-seçim akışında tazeleniyordu. Oysa backend `seatUsage` = aktif SA/ST
 * kullanıcı + PENDING SA/ST daveti, yani HER davet/rol/pasifleştirme onu
 * değiştirir. Sonuç: son koltuk dolunca dialog hâlâ davet ettiriyor (API
 * reddediyor), koltuk boşalınca ise rol seçeneklerini kilitli gösteriyordu.
 */
function invalidateUserCaches(qc: ReturnType<typeof useQueryClient>) {
  qc.invalidateQueries({ queryKey: ["company-users"] });
  qc.invalidateQueries({ queryKey: ["company-invitations"] });
  qc.invalidateQueries({ queryKey: ["company-seats"] });
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteUserInput) => {
      const { data } = await companyApi.post("/company/users", input);
      return data;
    },
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
  });
}

/** Yetki tablosu (Faz 4): kişinin izin listesini olduğu gibi yazar. */
export function useSetUserPermissions() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ id, permissions }: { id: string; permissions: string[] }) => {
      const { data } = await companyApi.put<{
        ok: boolean;
        permissions: string[];
        roles: CompanyRole[];
      }>(`/company/users/${id}/permissions`, { permissions });
      return data;
    },
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
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
    onSuccess: () => invalidateUserCaches(qc),
  });
}

export function useRemoveUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(`/company/users/${id}`);
      return data;
    },
    onSuccess: () => invalidateUserCaches(qc),
  });
}

/** Faz K — koltuk kullanımı (limit null = STANDART limitsiz). */
export interface SeatUsage {
  limit: number | null;
  used: number;
  pendingSeatInvites: number;
  overflow: number;
}

export function useSeats() {
  return useQuery({
    queryKey: ["company-seats"],
    queryFn: async () => {
      const { data } = await companyApi.get<SeatUsage>("/company/users/seats");
      return data;
    },
  });
}

/** Faz K — kurucu koltuk seçimi: kalacak SA/ST sahiplerinin id listesi. */
export function useSeatSelection() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (keepUserIds: string[]) => {
      const { data } = await companyApi.post<{
        ok: boolean;
        droppedCount: number;
      }>("/company/users/seat-selection", { keepUserIds });
      return data;
    },
    onSuccess: () => {
      invalidateUserCaches(qc);
    },
  });
}
