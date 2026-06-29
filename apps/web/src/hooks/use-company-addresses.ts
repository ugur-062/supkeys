"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type CompanyAddressType = "FATURA" | "ILETISIM" | "TESLIMAT";

export interface CompanyAddress {
  id: string;
  type: CompanyAddressType;
  title: string;
  contactName: string | null;
  phone: string | null;
  country: string;
  city: string | null;
  district: string | null;
  addressLine: string;
  postalCode: string | null;
  taxOffice: string | null;
  taxNumber: string | null;
  isDefault: boolean;
}

export interface UpsertAddressInput {
  type: CompanyAddressType;
  title: string;
  contactName?: string;
  phone?: string;
  country?: string;
  city?: string;
  district?: string;
  addressLine: string;
  postalCode?: string;
  taxOffice?: string;
  taxNumber?: string;
  isDefault?: boolean;
}

export function useAddresses() {
  return useQuery({
    queryKey: ["company-addresses"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyAddress[]>(
        "/company/addresses",
      );
      return data;
    },
  });
}

export function useSaveAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpsertAddressInput & { id?: string }) => {
      const { data } = id
        ? await companyApi.patch(`/company/addresses/${id}`, input)
        : await companyApi.post("/company/addresses", input);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-addresses"] }),
  });
}

export function useDeleteAddress() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(`/company/addresses/${id}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-addresses"] }),
  });
}
