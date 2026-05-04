"use client";

import { supplierApi } from "@/lib/supplier-auth/api";
import type {
  BidFormPayload,
  BidStatus,
  Currency,
  MyBidDetail,
} from "@/lib/tenders/types";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import { supplierTendersQueryKeys } from "./use-supplier-tenders";

const KEYS = {
  myBid: (tenderId: string) =>
    ["supplier", "tenders", "my-bid", tenderId] as const,
};

/** Tedarikçinin bu ihaledeki kendi teklifi (yoksa null döner) */
export function useMyBid(tenderId: string | null) {
  return useQuery({
    queryKey: KEYS.myBid(tenderId ?? ""),
    queryFn: async () => {
      const { data } = await supplierApi.get<MyBidDetail | null>(
        `/supplier/tenders/${tenderId}/my-bid`,
      );
      return data;
    },
    enabled: !!tenderId,
    refetchInterval: 30_000,
    staleTime: 10_000,
  });
}

interface SaveBidResponse extends MyBidDetail {}

export function useSaveBid(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: BidFormPayload) => {
      const { data } = await supplierApi.post<SaveBidResponse>(
        `/supplier/tenders/${tenderId}/bid`,
        payload,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myBid(tenderId) });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.detail(tenderId),
      });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.stats(),
      });
    },
  });
}

interface SubmitBidResponse {
  id: string;
  status: BidStatus;
  version: number;
  submittedAt: string;
  totalAmount: string;
  currency: Currency;
}

export function useSubmitBid(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await supplierApi.post<SubmitBidResponse>(
        `/supplier/tenders/${tenderId}/bid/submit`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myBid(tenderId) });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.detail(tenderId),
      });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.stats(),
      });
      qc.invalidateQueries({ queryKey: supplierTendersQueryKeys.all });
    },
  });
}

interface WithdrawBidResponse {
  id: string;
  status: BidStatus;
  withdrawnAt: string;
}

export function useWithdrawBid(tenderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await supplierApi.post<WithdrawBidResponse>(
        `/supplier/tenders/${tenderId}/bid/withdraw`,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.myBid(tenderId) });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.detail(tenderId),
      });
      qc.invalidateQueries({
        queryKey: supplierTendersQueryKeys.stats(),
      });
      qc.invalidateQueries({ queryKey: supplierTendersQueryKeys.all });
    },
  });
}

export const supplierBidQueryKeys = KEYS;
