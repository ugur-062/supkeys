"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { CompanyRole } from "@/lib/company-auth/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ApprovalType = "LISTING_PUBLISH" | "LISTING_AWARD";
export type ApprovalFlowStatus = "DRAFT" | "ACTIVE" | "PASSIVE";
export type ApprovalListingType = "ALIM" | "SATIS";

export interface ApprovalFlowStep {
  order: number;
  approverUserId: string;
  approverName: string;
  conditionMinAmount: number | null;
}

export interface ApprovalFlow {
  id: string;
  name: string;
  type: ApprovalType;
  listingType: ApprovalListingType | null;
  status: ApprovalFlowStatus;
  initiatorRoles: CompanyRole[];
  steps: ApprovalFlowStep[];
  createdAt: string;
}

export interface CreateApprovalFlowInput {
  name: string;
  type: ApprovalType;
  listingType?: ApprovalListingType;
  initiatorRoles?: CompanyRole[];
  steps: { approverUserId: string; conditionMinAmount?: number }[];
}

export interface PendingApproval {
  id: string;
  type: ApprovalType;
  amount: number;
  currency: string;
  createdAt: string;
  listing: { id: string; number: string | null; title: string; type: string };
  currentStepOrder: number;
  totalSteps: number;
}

export function useApprovalFlows() {
  return useQuery({
    queryKey: ["company-approvals", "flows"],
    queryFn: async () => {
      const { data } = await companyApi.get<ApprovalFlow[]>(
        "/company/approvals/flows",
      );
      return data;
    },
  });
}

export function useCreateApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApprovalFlowInput) => {
      const { data } = await companyApi.post(
        "/company/approvals/flows",
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-approvals", "flows"] }),
  });
}

export function useUpdateApprovalFlow(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: CreateApprovalFlowInput) => {
      const { data } = await companyApi.patch(
        `/company/approvals/flows/${id}`,
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-approvals", "flows"] }),
  });
}

export function useSetApprovalFlowStatus() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      status,
    }: {
      id: string;
      status: ApprovalFlowStatus;
    }) => {
      const { data } = await companyApi.patch(
        `/company/approvals/flows/${id}/status`,
        { status },
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-approvals", "flows"] }),
  });
}

export function useDeleteApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.delete(
        `/company/approvals/flows/${id}`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-approvals", "flows"] }),
  });
}

export function useDuplicateApprovalFlow() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.post(
        `/company/approvals/flows/${id}/duplicate`,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["company-approvals", "flows"] }),
  });
}

export function usePendingApprovals() {
  return useQuery({
    queryKey: ["company-approvals", "pending"],
    queryFn: async () => {
      const { data } = await companyApi.get<PendingApproval[]>(
        "/company/approvals/pending",
      );
      return data;
    },
  });
}

export function usePendingApprovalCount(enabled: boolean) {
  return useQuery({
    queryKey: ["company-approvals", "pending", "count"],
    enabled,
    refetchInterval: 60_000,
    queryFn: async () => {
      const { data } = await companyApi.get<{ count: number }>(
        "/company/approvals/pending/count",
      );
      return data.count;
    },
  });
}

export function useCancelApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await companyApi.post(`/company/approvals/${id}/cancel`);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-approvals"] });
      qc.invalidateQueries({ queryKey: ["company-listings"] });
    },
  });
}

export function useDecideApproval() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      action,
      note,
    }: {
      id: string;
      action: "approve" | "reject";
      note?: string;
    }) => {
      const { data } = await companyApi.post(
        `/company/approvals/${id}/${action}`,
        { note },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["company-approvals"] });
      qc.invalidateQueries({ queryKey: ["company-listings"] });
    },
  });
}
