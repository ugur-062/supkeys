"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export type BidDocKind =
  | "TEKLIF_MEKTUBU"
  | "TEKNIK_DOKUMAN"
  | "REFERANS"
  | "KATALOG"
  | "TEMINAT"
  | "DIGER";

/**
 * Teklif belgesi bölümü sırası. TEMINAT: eski kayıtlar görünsün diye listede
 * kalır ama teklifte SEÇİLEMEZ (teminat ihale sonrası sipariş aşaması).
 * Etiketler katalogda — `web.domain.bidDocKind.<KOD>`, hook
 * `useBidDocKindLabel()` (`@/i18n/domain`).
 */
export const BID_DOC_KINDS: BidDocKind[] = [
  "TEKLIF_MEKTUBU",
  "TEKNIK_DOKUMAN",
  "REFERANS",
  "KATALOG",
  "TEMINAT",
  "DIGER",
];
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
  const t = useTranslations("web.panel.requests.bidDocuments");
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
      if (!put.ok) throw new Error(t("dosyaYuklenemedi"));
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
