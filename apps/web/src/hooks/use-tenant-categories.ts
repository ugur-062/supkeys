"use client";

// Alıcı faaliyet kategorileri — ana (segment, ≤3) + alt (sınırsız). Firma
// profili kategori kartında okunur/düzenlenir.

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface TenantCategory {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

export interface TenantCategories {
  main: TenantCategory[];
  sub: TenantCategory[];
}

export interface UpdateTenantCategoriesPayload {
  mainCategoryIds: string[];
  subCategoryIds: string[];
}

const KEY = ["tenant-categories"] as const;

export function useTenantCategories() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await api.get<TenantCategories>(
        "/tenants/me/public-profile/categories",
      );
      return data;
    },
  });
}

export function useUpdateTenantCategories() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: UpdateTenantCategoriesPayload) => {
      const { data } = await api.patch<TenantCategories>(
        "/tenants/me/public-profile/categories",
        payload,
      );
      return data;
    },
    onSuccess: (data) => qc.setQueryData(KEY, data),
  });
}
