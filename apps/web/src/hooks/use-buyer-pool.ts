"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type BuyerRelationStatus =
  | "ACTIVE"
  | "PENDING_TENANT_APPROVAL"
  | "BLOCKED"
  | null;

export interface BuyerPoolItem {
  id: string;
  name: string;
  slug: string;
  supkeysId: string | null;
  publicEnabled: boolean;
  city: string | null;
  district: string | null;
  industry: string | null;
  logoUrl: string | null;
  services: string[];
  relationStatus: BuyerRelationStatus;
}

const KEYS = {
  pool: (search: string) => ["supplier", "buyer-pool", search] as const,
};

/** Premium tedarikçi — alıcı havuzu arama/listeleme. */
export function useBuyerPool(search: string) {
  return useQuery({
    queryKey: KEYS.pool(search),
    queryFn: async () => {
      const { data } = await supplierApi.get<BuyerPoolItem[]>(
        "/supplier-self-service/buyer-pool",
        { params: search ? { search } : {} },
      );
      return data;
    },
    staleTime: 30_000,
  });
}

interface ConnectResult {
  relationId: string;
  tenantName: string;
  status: string;
  message: string;
}

/** Havuzdan alıcıya bağlantı isteği. */
export function useConnectToBuyer() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (tenantId: string) => {
      const { data } = await supplierApi.post<ConnectResult>(
        "/supplier-self-service/buyer-pool/connect",
        { tenantId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier", "buyer-pool"] });
    },
  });
}

/** Rothern ID ile alıcıya bağlantı isteği. */
export function useConnectBuyerByRothernId() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (supkeysId: string) => {
      const { data } = await supplierApi.post<ConnectResult>(
        "/supplier-self-service/connect-by-supkeys-id",
        { supkeysId },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["supplier", "buyer-pool"] });
    },
  });
}
