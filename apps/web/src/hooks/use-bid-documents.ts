"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type BidDocKind =
  | "TEKLIF_MEKTUBU"
  | "TEKNIK_DOKUMAN"
  | "REFERANS"
  | "KATALOG"
  | "TEMINAT"
  | "DIGER";

/** Teklif belgesi bölümü etiketleri (UI). TEMINAT: eski kayıtlar görünsün diye
 * etikette kalır ama teklifte SEÇİLEMEZ (teminat ihale sonrası sipariş aşaması). */
export const BID_DOC_KIND_LABELS: Record<BidDocKind, string> = {
  TEKLIF_MEKTUBU: "Teklif Mektubu",
  TEKNIK_DOKUMAN: "Teknik Doküman",
  REFERANS: "Referans / İş Bitirme",
  KATALOG: "Katalog / Broşür",
  TEMINAT: "Teminat Mektubu",
  DIGER: "Diğer",
};
export const BID_DOC_KINDS = Object.keys(BID_DOC_KIND_LABELS) as BidDocKind[];
/** Teklif aşamasında SEÇİLEBİLİR kategoriler — teminat hariç (o, sipariş aşaması). */
export const BID_DOC_SELECTABLE_KINDS: BidDocKind[] = BID_DOC_KINDS.filter(
  (k) => k !== "TEMINAT",
);

export interface BidDocument {
  id: string;
  bidId: string;
  kind: BidDocKind;
  bidderName: string;
  fileName: string;
  mimeType: string;
  createdAt: string;
  mine: boolean;
  url: string; // presigned GET
}

export function useBidDocuments(listingId: string) {
  return useQuery({
    queryKey: ["bid-documents", listingId],
    queryFn: async () => {
      const { data } = await companyApi.get<BidDocument[]>(
        `/company/listings/${listingId}/bid-documents`,
      );
      return data;
    },
  });
}

export function useUploadBidDoc(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ file, kind }: { file: File; kind: BidDocKind }) => {
      const { data } = await companyApi.post<{ url: string; key: string }>(
        `/company/listings/${listingId}/bid-documents/upload-url`,
        { fileName: file.name, mimeType: file.type, fileSize: file.size },
      );
      const put = await fetch(data.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Dosya yüklenemedi (R2)");
      await companyApi.post(`/company/listings/${listingId}/bid-documents`, {
        key: data.key,
        fileName: file.name,
        mimeType: file.type,
        kind,
      });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bid-documents", listingId] }),
  });
}

export function useDeleteBidDoc(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      await companyApi.delete(
        `/company/listings/${listingId}/bid-documents/${docId}`,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["bid-documents", listingId] }),
  });
}
