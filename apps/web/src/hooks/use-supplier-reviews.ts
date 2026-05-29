"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface OwnOrderReview {
  id: string;
  rating: number;
  reviewText: string | null;
  isPublic: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface OwnOrderReviewResponse {
  review: OwnOrderReview | null;
  /** Order COMPLETED ise true (yorum yapılabilir). */
  canReview: boolean;
  /** Mevcut review 30 günlük edit penceresinde mi. */
  canEdit: boolean;
}

export interface UpsertReviewPayload {
  rating: number;
  reviewText?: string;
  isPublic?: boolean;
}

const KEYS = {
  ownReview: (orderId: string) =>
    ["supplier-reviews", "own", orderId] as const,
};

export function useOwnOrderReview(orderId: string | null) {
  return useQuery<OwnOrderReviewResponse>({
    queryKey: KEYS.ownReview(orderId ?? ""),
    queryFn: () =>
      api.get(`/tenants/me/orders/${orderId}/review`).then((r) => r.data),
    enabled: Boolean(orderId),
    staleTime: 15_000,
  });
}

export function useUpsertOrderReview(orderId: string) {
  const qc = useQueryClient();
  return useMutation<OwnOrderReview, unknown, UpsertReviewPayload>({
    mutationFn: (dto) =>
      api.put(`/tenants/me/orders/${orderId}/review`, dto).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.ownReview(orderId) });
    },
  });
}

export function useDeleteOrderReview(orderId: string) {
  const qc = useQueryClient();
  return useMutation<{ deleted: boolean }, unknown, void>({
    mutationFn: () =>
      api.delete(`/tenants/me/orders/${orderId}/review`).then((r) => r.data),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: KEYS.ownReview(orderId) });
    },
  });
}
