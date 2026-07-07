"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface MyComplaint {
  id: string;
  against: { name: string; rothernId: string | null };
  reason: string;
  status: "OPEN" | "RESOLVED" | "DISMISSED";
  createdAt: string;
}

export function useMyComplaints() {
  return useQuery({
    queryKey: ["company-complaints"],
    queryFn: async () => {
      const { data } = await companyApi.get<MyComplaint[]>(
        "/company/complaints",
      );
      return data;
    },
  });
}

export function useFileComplaint() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      rothernId: string;
      reason: string;
      detail?: string;
    }) => {
      const { data } = await companyApi.post("/company/complaints", input);
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-complaints"] }),
  });
}
