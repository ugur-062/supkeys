"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface SupplierTemplateRow {
  id: string;
  name: string;
  isPublic: boolean;
  memberCount: number;
  isOwnedByMe: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface SupplierTemplateDetail {
  id: string;
  name: string;
  isPublic: boolean;
  members: {
    id: string;
    name: string;
    rothernId: string | null;
    tier: "STANDART" | "BRONZ" | "SILVER" | "GOLD";
  }[];
}

export function useSupplierTemplates() {
  return useQuery({
    queryKey: ["supplier-templates"],
    queryFn: async () => {
      const { data } = await companyApi.get<SupplierTemplateRow[]>(
        "/company/supplier-templates",
      );
      return data;
    },
  });
}

/** Şablon detayını ihtiyaç anında çeker (apply için). */
export function fetchSupplierTemplate(id: string) {
  return companyApi
    .get<SupplierTemplateDetail>(`/company/supplier-templates/${id}`)
    .then((r) => r.data);
}

/** Şablon detayı — düzenleme dialogu için (üye listesiyle). */
export function useSupplierTemplateDetail(id: string) {
  return useQuery({
    queryKey: ["supplier-templates", "detail", id],
    enabled: !!id,
    queryFn: () => fetchSupplierTemplate(id),
  });
}

export function useUpdateSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      ...input
    }: {
      id: string;
      name?: string;
      isPublic?: boolean;
      memberCompanyIds?: string[];
    }) => {
      const { data } = await companyApi.patch(
        `/company/supplier-templates/${id}`,
        input,
      );
      return data;
    },
    onSuccess: (_d, v) => {
      qc.invalidateQueries({ queryKey: ["supplier-templates"] });
      qc.invalidateQueries({
        queryKey: ["supplier-templates", "detail", v.id],
      });
    },
  });
}

export function useCreateSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      isPublic?: boolean;
      memberCompanyIds: string[];
    }) => {
      const { data } = await companyApi.post(
        "/company/supplier-templates",
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["supplier-templates"] }),
  });
}

export function useDeleteSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(
        `/company/supplier-templates/${id}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["supplier-templates"] }),
  });
}
