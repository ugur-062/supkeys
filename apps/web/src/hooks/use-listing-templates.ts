"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface ListingTemplate {
  id: string;
  name: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

export function useListingTemplates() {
  return useQuery({
    queryKey: ["listing-templates"],
    queryFn: async () => {
      const { data } = await companyApi.get<ListingTemplate[]>(
        "/company/listing-templates",
      );
      return data;
    },
  });
}

export function useSaveTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      payload: Record<string, unknown>;
    }) => {
      const { data } = await companyApi.post(
        "/company/listing-templates",
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listing-templates"] }),
  });
}

export function useDeleteTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      await companyApi.delete(`/company/listing-templates/${id}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["listing-templates"] }),
  });
}
