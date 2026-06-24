"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface AdminTenantListItem {
  id: string;
  name: string;
  slug: string;
  taxNumber: string | null;
  taxOffice: string | null;
  city: string | null;
  isActive: boolean;
  membershipEndAt: string | null;
  createdAt: string;
  _count: {
    users: number;
    tenders: number;
    orders: number;
    supplierRelations: number;
  };
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    lastLoginAt: string | null;
  }>;
}

export interface MembershipAlertTenant {
  id: string;
  name: string;
  city: string | null;
  taxNumber: string | null;
  membershipEndAt: string;
  isActive: boolean;
}

export interface MembershipAlerts {
  expiringSoon: MembershipAlertTenant[];
  expired: MembershipAlertTenant[];
  counts: { expiringSoon: number; expired: number };
  daysAhead: number;
}

export function useMembershipAlerts(daysAhead = 30, limit = 20) {
  return useQuery({
    queryKey: ["admin", "tenants", "membership-alerts", daysAhead, limit],
    queryFn: async () => {
      const { data } = await api.get<MembershipAlerts>(
        `/admin/tenants/membership-alerts?daysAhead=${daysAhead}&limit=${limit}`,
      );
      return data;
    },
    staleTime: 60_000,
    refetchInterval: 60_000,
    refetchIntervalInBackground: false,
  });
}

export interface AdminTenantListResponse {
  items: AdminTenantListItem[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export interface AdminTenantDetail {
  id: string;
  name: string;
  slug: string;
  taxNumber: string | null;
  taxOffice: string | null;
  industry: string | null;
  city: string | null;
  district: string | null;
  addressLine: string | null;
  postalCode: string | null;
  buyerSeatLimit: number;
  buyerSeatUsage: {
    active: number;
    pending: number;
    used: number;
    limit: number;
  };
  membershipEndAt: string | null;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  users: Array<{
    id: string;
    firstName: string;
    lastName: string;
    email: string;
    role: string;
    isActive: boolean;
    emailVerifiedAt: string | null;
    twoFactorEnabled: boolean;
    lastLoginAt: string | null;
    createdAt: string;
  }>;
  _count: {
    users: number;
    tenders: number;
    orders: number;
    supplierRelations: number;
    approvalFlows: number;
  };
  analytics: {
    tendersByStatus: Array<{ status: string; count: number }>;
    ordersByStatus: Array<{ status: string; count: number }>;
    totalSpendCompleted: string | number;
    recentTenders: Array<{
      id: string;
      tenderNumber: string;
      title: string;
      status: string;
      primaryCurrency: string;
      createdAt: string;
    }>;
  };
}

export interface ListAdminTenantsParams {
  search?: string;
  sort?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminTenants(params: ListAdminTenantsParams = {}) {
  const search = new URLSearchParams();
  if (params.search) search.set("search", params.search);
  if (params.sort) search.set("sort", params.sort);
  if (params.page) search.set("page", String(params.page));
  if (params.pageSize) search.set("pageSize", String(params.pageSize));
  const qs = search.toString();

  return useQuery({
    queryKey: ["admin", "tenants", "list", params],
    queryFn: async () => {
      const { data } = await api.get<AdminTenantListResponse>(
        `/admin/tenants${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 30_000,
  });
}

export function useAdminTenantDetail(id: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "tenants", "detail", id ?? ""],
    queryFn: async () => {
      const { data } = await api.get<AdminTenantDetail>(
        `/admin/tenants/${id}`,
      );
      return data;
    },
    enabled: Boolean(id),
    staleTime: 30_000,
  });
}

export interface UpdateAdminTenantPayload {
  buyerSeatLimit?: number;
  membershipEndAt?: string | null;
  extendMonths?: number;
  isActive?: boolean;
  name?: string;
  taxNumber?: string | null;
  taxOffice?: string | null;
  industry?: string | null;
  city?: string | null;
  district?: string | null;
  addressLine?: string | null;
  postalCode?: string | null;
}

export interface UpdateTenantUserPayload {
  role?: "COMPANY_ADMIN" | "BUYER" | "APPROVER";
  isActive?: boolean;
}

export function useUpdateTenantUser(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      userId: string;
      payload: UpdateTenantUserPayload;
    }) => {
      const { data } = await api.patch(
        `/admin/tenants/${tenantId}/users/${input.userId}`,
        input.payload,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "detail", tenantId],
      });
    },
  });
}

export function useIssuePasswordReset(tenantId: string) {
  return useMutation({
    mutationFn: async (userId: string) => {
      const { data } = await api.post<{
        success: boolean;
        email: string;
        expiresAt: string;
        resetUrl: string;
      }>(`/admin/tenants/${tenantId}/users/${userId}/password-reset`);
      return data;
    },
  });
}

export function useTenantUserRecovery(tenantId: string) {
  const queryClient = useQueryClient();
  const invalidate = () =>
    queryClient.invalidateQueries({
      queryKey: ["admin", "tenants", "detail", tenantId],
    });
  return {
    verifyEmail: useMutation({
      mutationFn: async (userId: string) =>
        (await api.post(`/admin/tenants/${tenantId}/users/${userId}/verify-email`))
          .data,
      onSuccess: invalidate,
    }),
    reset2fa: useMutation({
      mutationFn: async (userId: string) =>
        (await api.post(`/admin/tenants/${tenantId}/users/${userId}/reset-2fa`))
          .data,
      onSuccess: invalidate,
    }),
    changeEmail: useMutation({
      mutationFn: async (input: { userId: string; email: string }) =>
        (
          await api.patch(
            `/admin/tenants/${tenantId}/users/${input.userId}/email`,
            { email: input.email },
          )
        ).data,
      onSuccess: invalidate,
    }),
  };
}

export function useCancelTenantInvitation(tenantId: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (invitationId: string) => {
      const { data } = await api.delete(
        `/admin/tenants/${tenantId}/invitations/${invitationId}`,
      );
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "detail", tenantId],
      });
    },
  });
}

export interface AdminTenantTenderItem {
  id: string;
  tenderNumber: string;
  title: string;
  status: string;
  primaryCurrency: string;
  bidsCloseAt: string;
  awardedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  createdBy: { firstName: string; lastName: string; email: string };
  _count: { items: number; invitations: number; bids: number };
}

export interface AdminTenantOrderItem {
  id: string;
  orderNumber: string;
  status: string;
  totalAmount: string | number;
  currency: string;
  createdAt: string;
  completedAt: string | null;
  cancelledAt: string | null;
  tender: { id: string; tenderNumber: string; title: string };
  supplier: { id: string; companyName: string };
}

export interface PaginatedResponse<T> {
  items: T[];
  pagination: {
    page: number;
    pageSize: number;
    total: number;
    totalPages: number;
  };
}

export function useAdminTenantTenders(
  tenantId: string,
  params: { page?: number; status?: string } = {},
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.status) search.set("status", params.status);
  const qs = search.toString();

  return useQuery({
    queryKey: ["admin", "tenants", "tenders", tenantId, params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AdminTenantTenderItem>>(
        `/admin/tenants/${tenantId}/tenders${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });
}

export function useAdminTenantOrders(
  tenantId: string,
  params: { page?: number; status?: string } = {},
) {
  const search = new URLSearchParams();
  if (params.page) search.set("page", String(params.page));
  if (params.status) search.set("status", params.status);
  const qs = search.toString();

  return useQuery({
    queryKey: ["admin", "tenants", "orders", tenantId, params],
    queryFn: async () => {
      const { data } = await api.get<PaginatedResponse<AdminTenantOrderItem>>(
        `/admin/tenants/${tenantId}/orders${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    enabled: Boolean(tenantId),
    staleTime: 30_000,
  });
}

export function useUpdateAdminTenant(id: string) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateAdminTenantPayload) => {
      const { data } = await api.patch<{
        id: string;
        buyerSeatLimit: number;
        membershipEndAt: string | null;
        updatedAt: string;
      }>(`/admin/tenants/${id}`, payload);
      return data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "detail", id],
      });
      queryClient.invalidateQueries({
        queryKey: ["admin", "tenants", "list"],
      });
    },
  });
}
