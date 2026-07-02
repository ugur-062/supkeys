"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CompanyBankAccount {
  id: string;
  title: string;
  accountHolder: string;
  iban: string;
  bankName: string | null;
  isDefault: boolean;
}

export interface UpsertBankAccountInput {
  title: string;
  accountHolder: string;
  iban: string;
  bankName?: string;
  isDefault?: boolean;
}

export function useBankAccounts() {
  return useQuery({
    queryKey: ["company-bank-accounts"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyBankAccount[]>(
        "/company/bank-accounts",
      );
      return data;
    },
  });
}

export function useSaveBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: UpsertBankAccountInput & { id?: string }) => {
      const { data } = id
        ? await companyApi.patch(`/company/bank-accounts/${id}`, input)
        : await companyApi.post("/company/bank-accounts", input);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-bank-accounts"] }),
  });
}

export function useDeleteBankAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(`/company/bank-accounts/${id}`);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-bank-accounts"] }),
  });
}
