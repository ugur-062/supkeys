"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { CompanyRole } from "@/lib/company-auth/types";
import type { Locale } from "@rothern/i18n";
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
  /** Davet dili — e-posta + kabul sayfası; yoksa davet edenin kayıtlı dili. */
  locale?: Locale;
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

/**
 * Davet e-postasının GERÇEK teslim sonucu (2026-09-27) — API davet ve
 * yeniden gönder yanıtlarında döner. `suppressed`: adres daha önce kalıcı
 * geri döndü/şikâyet etti (yeniden göndermek işe yaramaz); `failed`:
 * sağlayıcı hatası (yeniden gönder denenebilir). Eski API alanı döndürmez →
 * `emailSent` yoksa "gönderildi" varsayılır.
 */
export interface InvitationEmailResult {
  emailSent?: boolean;
  emailFailureReason?: "suppressed" | "failed";
}

export function useInviteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: InviteUserInput) => {
      const { data } = await companyApi.post<
        { id: string; email: string; expiresAt: string } & InvitationEmailResult
      >("/company/users", input);
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
      const { data } = await companyApi.post<{ ok: true } & InvitationEmailResult>(
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
    onSuccess: () => {
      invalidateUserCaches(qc);
      // Kurucu KENDİ işlem tiklerini düzenleyebilir; sunucu kişinin kendi
      // değişikliği için "Firma yöneticiniz yetkilerinizi değiştirdi"
      // bildirimini artık yollamıyor (arayüz testi Y-13) → /me burada tazelenir.
      qc.invalidateQueries({ queryKey: ["company-auth", "me"] });
    },
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
    onSuccess: (_data, vars) => {
      invalidateUserCaches(qc);
      // Kuruculuk devri EYLEMİ YAPANIN yetkisini de düşürür (isOwner,
      // billing:manage, users:manage); sunucu `permissions_changed`i yalnız
      // yeni Kurucuya yollar → eski Kurucunun /me'si burada tazelenir, menü ve
      // kapılar sayfa yenilenmeden yeni rolüyle çizilir (derin denetim MU-13).
      if (vars.roles?.includes("SAHIP" as CompanyRole)) {
        qc.invalidateQueries({ queryKey: ["company-auth", "me"] });
      }
    },
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
  /**
   * Efektif paket. Satınalma yetkisi yalnız GOLD'da verilebilir (talep açma ve
   * kazandırma ücretsiz pakette kapalı) — yetki tablosu bunu okuyup satınalma
   * grubunu kilitler; backend `assertSeatAvailable` aynı kuralı uygular.
   */
  tier: "STANDART" | "SILVER" | "GOLD";
  /** Toplam koltuk = satınalma + satış (aynı kişide ikisi 2). */
  used: number;
  usedBuy: number;
  usedSell: number;
  pendingSeatInvites: number;
  pendingBuy: number;
  pendingSell: number;
  overflow: number;
}

export type SeatGroup = "buy" | "sell";
export interface SeatKeep {
  userId: string;
  group: SeatGroup;
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
    mutationFn: async (keep: SeatKeep[]) => {
      const { data } = await companyApi.post<{
        ok: boolean;
        droppedCount: number;
      }>("/company/users/seat-selection", { keep });
      return data;
    },
    onSuccess: () => {
      invalidateUserCaches(qc);
    },
  });
}
