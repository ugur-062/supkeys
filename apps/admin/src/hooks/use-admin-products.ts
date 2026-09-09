"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/** Ürün moderasyonu (2026-09-09) — `admin/products*` uçlarının aynası. */
export type ProductReviewStatus = "DRAFT" | "PENDING" | "APPROVED" | "REJECTED";

export interface AdminProductRow {
  id: string;
  name: string;
  slug: string | null;
  cover: string | null;
  imageCount: number;
  categoryId: string | null;
  categoryName: string | null;
  reviewStatus: ProductReviewStatus;
  isPublic: boolean;
  submittedAt: string | null;
  reviewedAt: string | null;
  reviewedByAdminId: string | null;
  rejectReason: string | null;
  updatedAt: string;
  company: {
    id: string;
    name: string;
    slug: string | null;
    city: string | null;
    tier: string;
    verification: string;
    isBlocked: boolean;
  };
}

export interface AdminProductDetail extends AdminProductRow {
  images: string[];
  code: string | null;
  description: string | null;
  keywords: string[];
  brand: string | null;
  mpn: string | null;
  priceMode: "FIXED" | "TIERED" | "ON_REQUEST";
  priceAmount: string | null;
  priceTiers: { minQty: number; unitPrice: number }[] | null;
  priceCurrency: string;
  moq: string | null;
  unit: string;
  videoUrl: string | null;
  externalUrl: string | null;
  documents: { url: string; title: string }[] | null;
  completionScore: number | null;
  attributeList: { key: string; label: string; value: string; unit: string | null }[];
  company: AdminProductRow["company"] & { publicUrl: string | null };
  publicUrl: string | null;
  createdAt: string;
}

export interface AdminProductListParams {
  status?: ProductReviewStatus | "ALL";
  q?: string;
  page?: number;
  pageSize?: number;
}

export function useAdminProducts(params: AdminProductListParams) {
  return useQuery({
    queryKey: ["admin-products", params],
    queryFn: async () => {
      const { data } = await api.get<{ items: AdminProductRow[]; total: number; page: number; pageSize: number }>(
        "/admin/products",
        { params },
      );
      return data;
    },
  });
}

export function useAdminProductStats() {
  return useQuery({
    queryKey: ["admin-product-stats"],
    queryFn: async () => {
      const { data } = await api.get<{ pending: number; rejected: number; oldestPendingSince: string | null }>(
        "/admin/products/stats",
      );
      return data;
    },
  });
}

export function useAdminProductDetail(id: string) {
  return useQuery({
    queryKey: ["admin-product-detail", id],
    queryFn: async () => {
      const { data } = await api.get<AdminProductDetail>(`/admin/products/${id}`);
      return data;
    },
    enabled: !!id,
  });
}

export function useProductReview(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { action: "approve" } | { action: "reject"; reason: string }) => {
      const { action, ...body } = input;
      await api.post(`/admin/products/${id}/${action}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-product-detail", id] });
      qc.invalidateQueries({ queryKey: ["admin-products"] });
      qc.invalidateQueries({ queryKey: ["admin-product-stats"] });
    },
  });
}
