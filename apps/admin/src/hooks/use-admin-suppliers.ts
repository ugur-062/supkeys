"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminSupplierListItem {
  id: string;
  companyName: string;
  taxNumber: string;
  taxOffice: string;
  city: string | null;
  industry: string | null;
  membership: "STANDARD" | "PREMIUM";
  isActive: boolean;
  isBlocked: boolean;
  createdAt: string;
  _count: {
    users: number;
    bids: number;
    orders: number;
    tenantRelations: number;
  };
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    lastLoginAt: string | null;
  }>;
}

export interface AdminSupplierListResponse {
  items: AdminSupplierListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminSupplierDetail
  extends Omit<AdminSupplierListItem, "_count" | "users"> {
  taxCertUrl: string;
  website: string | null;
  district: string;
  addressLine: string;
  postalCode: string | null;
  blockedReason: string | null;
  blockedAt: string | null;
  updatedAt: string;
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    phone: string | null;
    isActive: boolean;
    isManager: boolean;
    emailVerifiedAt: string | null;
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
  _count: {
    users: number;
    bids: number;
    orders: number;
    tenantRelations: number;
  };
  analytics: {
    bidsByStatus: Array<{ status: string; count: number }>;
    ordersByStatus: Array<{ status: string; count: number }>;
    totalRevenueCompleted: string | number;
    winRatePercent: number;
  };
}

export interface ListAdminSuppliersParams {
  search?: string;
  membership?: "STANDARD" | "PREMIUM";
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminSuppliers(params: ListAdminSuppliersParams = {}) {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.membership) search.set("membership", params.membership);
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();

  return useQuery({
    queryKey: ["admin", "suppliers", "list", params],
    queryFn: async () => {
      const { data } = await api.get<AdminSupplierListResponse>(
        `/admin/suppliers${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useAdminSupplierDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "suppliers", "detail", id ?? ""],
    queryFn: async () => {
      const { data } = await api.get<AdminSupplierDetail>(
        `/admin/suppliers/${id}`,
      );
      return data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export interface UpdateSupplierPayload {
  membership?: "STANDARD" | "PREMIUM";
  isActive?: boolean;
  blockedReason?: string;
  companyName?: string;
  taxNumber?: string | null;
  taxOffice?: string;
  industry?: string | null;
  website?: string | null;
  city?: string;
  district?: string;
  addressLine?: string;
  postalCode?: string | null;
}

export function useUpdateAdminSupplier(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateSupplierPayload) => {
      const { data } = await api.patch(`/admin/suppliers/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "suppliers", "detail", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "suppliers", "list"],
      });
    },
  });
}

export interface SupplierUserPayload {
  isActive?: boolean;
  isManager?: boolean;
  firstName?: string;
  lastName?: string;
  phone?: string;
}

export function useUpdateSupplierUser(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      payload: SupplierUserPayload;
    }) => {
      const { data } = await api.patch(
        `/admin/suppliers/${supplierId}/users/${input.userId}`,
        input.payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "suppliers", "detail", supplierId],
      });
    },
  });
}

export function useDeleteSupplierUser(supplierId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.delete(
        `/admin/suppliers/${supplierId}/users/${userId}`,
      );
      return data;
    },
    onSuccess: () =>
      queryClient.invalidateQueries({
        queryKey: ["admin", "suppliers", "detail", supplierId],
      }),
  });
}

export function useIssueSupplierPasswordReset(supplierId: string) {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{
        success: boolean;
        email: string;
        expiresAt: string;
        resetUrl: string;
      }>(`/admin/suppliers/${supplierId}/users/${userId}/password-reset`);
      return data;
    },
  });
}

export function useSupplierUserRecovery(supplierId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin", "suppliers", "detail", supplierId],
    });
  return {
    verifyEmail: useMutation({
      mutationFn: async (userId: string) =>
        (
          await api.post(
            `/admin/suppliers/${supplierId}/users/${userId}/verify-email`,
          )
        ).data,
      onSuccess: invalidate,
    }),
    reset2fa: useMutation({
      mutationFn: async (userId: string) =>
        (
          await api.post(
            `/admin/suppliers/${supplierId}/users/${userId}/reset-2fa`,
          )
        ).data,
      onSuccess: invalidate,
    }),
    changeEmail: useMutation({
      mutationFn: async (input: { userId: string; email: string }) =>
        (
          await api.patch(
            `/admin/suppliers/${supplierId}/users/${input.userId}/email`,
            { email: input.email },
          )
        ).data,
      onSuccess: invalidate,
    }),
  };
}
