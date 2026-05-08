"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

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
