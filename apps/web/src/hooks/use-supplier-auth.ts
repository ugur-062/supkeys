"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import type {
  SupplierLoginResponse,
  SupplierMeResponse,
} from "@/lib/supplier-auth/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

export function useSupplierAuth() {
  const token = useSupplierAuthStore((s) => s.token);
  const supplierUser = useSupplierAuthStore((s) => s.supplierUser);
  const supplier = useSupplierAuthStore((s) => s.supplier);
  const tenantRelations = useSupplierAuthStore((s) => s.tenantRelations);
  return {
    token,
    supplierUser,
    supplier,
    tenantRelations,
    isAuthenticated: !!token && !!supplierUser,
  };
}

export function useSupplierLogin() {
  const setAuth = useSupplierAuthStore((s) => s.setAuth);
  return useMutation({
    mutationFn: async (input: { email: string; password: string }) => {
      const { data } = await supplierApi.post<SupplierLoginResponse>(
        "/supplier-auth/login",
        input,
      );
      return data;
    },
    onSuccess: (data) => {
      setAuth({
        token: data.token,
        supplierUser: data.supplierUser,
        supplier: data.supplier,
      });
    },
  });
}

export function useSupplierMe(enabled = true) {
  const token = useSupplierAuthStore((s) => s.token);
  const setMe = useSupplierAuthStore((s) => s.setMe);
  return useQuery({
    queryKey: ["supplier-auth", "me"],
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierMeResponse>(
        "/supplier-auth/me",
      );
      setMe(data);
      return data;
    },
    enabled: !!token && enabled,
    staleTime: 60 * 1000,
  });
}

export function useSupplierLogout() {
  const clear = useSupplierAuthStore((s) => s.clear);
  const queryClient = useQueryClient();
  return () => {
    clear();
    queryClient.clear();
    if (typeof window !== "undefined") {
      window.location.href = "/supplier/login";
    }
  };
}
