"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type OrderDocType = "DELIVERY" | "PAYMENT" | "TEMINAT";

export interface OrderDocument {
  id: string;
  type: OrderDocType;
  fileName: string;
  mimeType: string;
  createdAt: string;
  url: string; // presigned GET
}

export function useOrderDocuments(orderId: string) {
  return useQuery({
    queryKey: ["order-documents", orderId],
    queryFn: async () => {
      const { data } = await companyApi.get<OrderDocument[]>(
        `/company/orders/${orderId}/documents`,
      );
      return data;
    },
  });
}

export function useUploadOrderDoc(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      file,
      type,
    }: {
      file: File;
      type: OrderDocType;
    }) => {
      // 1. presigned PUT url
      const { data } = await companyApi.post<{ url: string; key: string }>(
        `/company/orders/${orderId}/documents/upload-url`,
        { fileName: file.name, mimeType: file.type, type, fileSize: file.size },
      );
      // 2. R2'ya doğrudan yükle
      const put = await fetch(data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Dosya yüklenemedi (R2)");
      // 3. kaydı oluştur
      await companyApi.post(`/company/orders/${orderId}/documents`, {
        type,
        key: data.key,
        fileName: file.name,
        mimeType: file.type,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["order-documents", orderId] }),
  });
}

export function useDeleteOrderDoc(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      await companyApi.delete(`/company/orders/${orderId}/documents/${docId}`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["order-documents", orderId] }),
  });
}
