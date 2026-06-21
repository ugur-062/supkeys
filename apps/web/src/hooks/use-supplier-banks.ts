import { supplierApi } from "@/lib/supplier-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// G6 madde 20 — Kayıtlı Bankalarım.
export interface SupplierBank {
  id: string;
  accountHolder: string;
  iban: string;
  bankName: string | null;
  label: string | null;
  isDefault: boolean;
}

export interface SupplierBankPayload {
  accountHolder: string;
  iban: string;
  bankName?: string;
  label?: string;
  isDefault?: boolean;
}

const KEY = ["supplier-banks"] as const;

export function useSupplierBanks() {
  return useQuery({
    queryKey: KEY,
    queryFn: async () => {
      const { data } = await supplierApi.get<SupplierBank[]>("/supplier-banks");
      return data;
    },
  });
}

export function useCreateSupplierBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SupplierBankPayload) => {
      const { data } = await supplierApi.post<SupplierBank>(
        "/supplier-banks",
        payload,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useUpdateSupplierBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...payload
    }: SupplierBankPayload & { id: string }) => {
      const { data } = await supplierApi.patch<SupplierBank>(
        `/supplier-banks/${id}`,
        payload,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}

export function useDeleteSupplierBank() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await supplierApi.delete(`/supplier-banks/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEY }),
  });
}
