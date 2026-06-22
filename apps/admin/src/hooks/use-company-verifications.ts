"use client";

import { api } from "@/lib/api";
import type {
  CompanyVerificationDetail,
  CompanyVerificationListResponse,
  OwnerType,
} from "@/lib/company-verifications/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  all: ["admin", "company-verifications"] as const,
  list: (status: string, search: string) =>
    [...KEYS.all, "list", status, search] as const,
  detail: (ownerType: string, id: string) =>
    [...KEYS.all, "detail", ownerType, id] as const,
};

export function useCompanyVerifications(status: string, search: string) {
  return useQuery({
    queryKey: KEYS.list(status, search),
    queryFn: async () => {
      const { data } = await api.get<CompanyVerificationListResponse>(
        "/admin/company-verifications",
        { params: { ...(status ? { status } : {}), ...(search ? { search } : {}) } },
      );
      return data;
    },
    refetchInterval: 10_000,
  });
}

export function useCompanyVerificationDetail(
  ownerType: OwnerType | null,
  id: string | null,
) {
  return useQuery({
    queryKey: KEYS.detail(ownerType ?? "", id ?? ""),
    queryFn: async () => {
      const { data } = await api.get<CompanyVerificationDetail>(
        `/admin/company-verifications/${ownerType}/${id}`,
      );
      return data;
    },
    enabled: !!ownerType && !!id,
  });
}

export function useApproveCompanyVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ownerType: OwnerType; id: string }) =>
      api
        .post(`/admin/company-verifications/${v.ownerType}/${v.id}/approve`)
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}

export function useRejectCompanyVerification() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (v: { ownerType: OwnerType; id: string; reason: string }) =>
      api
        .post(`/admin/company-verifications/${v.ownerType}/${v.id}/reject`, {
          reason: v.reason,
        })
        .then((r) => r.data),
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.all }),
  });
}
