"use client";

import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { supplierApi } from "@/lib/supplier-auth/api";

export interface SupplierCategoryItem {
  id: string;
  code: string;
  nameTr: string;
  level: number;
  breadcrumb: string;
}

const KEYS = {
  myCategories: ["supplier-profile", "categories"] as const,
};

/**
 * V2-6 — Tedarikçinin kendi kategorileri (Family seviyesi).
 * Profil sayfasında listele/düzenle akışı için kullanılır.
 */
export function useSupplierCategories() {
  return useQuery<SupplierCategoryItem[]>({
    queryKey: KEYS.myCategories,
    queryFn: () =>
      supplierApi.get("/supplier-profile/me/categories").then((r) => r.data),
    staleTime: 60 * 1000,
  });
}

export function useUpdateSupplierCategories() {
  const qc = useQueryClient();
  return useMutation<
    SupplierCategoryItem[],
    unknown,
    { categoryIds: string[] }
  >({
    mutationFn: (dto) =>
      supplierApi
        .patch("/supplier-profile/me/categories", dto)
        .then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myCategories });
      // /me response'unda da categories var — supplier-auth store yenile
      qc.invalidateQueries({ queryKey: ["supplier-auth", "me"] });
    },
  });
}
