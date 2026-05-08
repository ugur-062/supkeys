"use client";

import { api } from "@/lib/api";
import type {
  AddressType,
  CreateAddressPayload,
  TenantAddress,
  UpdateAddressPayload,
} from "@/lib/addresses/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["tenant-addresses"] as const,
  list: (params: { type?: AddressType; activeOnly?: boolean }) =>
    [...KEYS.all, "list", params] as const,
  detail: (id: string) => [...KEYS.all, "detail", id] as const,
};

interface ListParams {
  type?: AddressType;
  activeOnly?: boolean;
}

export function useTenantAddresses(params: ListParams = {}) {
  return useQuery({
    queryKey: KEYS.list(params),
    queryFn: async () => {
      const search = new URLSearchParams();
      if (params.type) search.set("type", params.type);
      if (params.activeOnly) search.set("activeOnly", "true");
      const qs = search.toString();
      const { data } = await api.get<TenantAddress[]>(
        `/tenants/me/addresses${qs ? `?${qs}` : ""}`,
      );
      return data;
    },
    staleTime: 30_000,
  });
}

export function useCreateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: CreateAddressPayload) => {
      const { data } = await api.post<TenantAddress>(
        "/tenants/me/addresses",
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useUpdateAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { id: string; payload: UpdateAddressPayload }) => {
      const { data } = await api.patch<TenantAddress>(
        `/tenants/me/addresses/${input.id}`,
        input.payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useSetDefaultAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.post<TenantAddress>(
        `/tenants/me/addresses/${id}/set-default`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete(`/tenants/me/addresses/${id}`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.all });
    },
  });
}

export const tenantAddressesQueryKeys = KEYS;
