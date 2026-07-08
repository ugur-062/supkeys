"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type ListingDocKind =
  | "IDARI_SARTNAME"
  | "TEKNIK_SARTNAME"
  | "SOZLESME"
  | "EK"
  | "NUMUNE"
  | "DIGER";

/** İhale dosyası bölümü etiketleri (UI). */
export const LISTING_DOC_KIND_LABELS: Record<ListingDocKind, string> = {
  IDARI_SARTNAME: "İdari Şartname",
  TEKNIK_SARTNAME: "Teknik Şartname",
  SOZLESME: "Sözleşme Taslağı",
  EK: "Ek / Çizim",
  NUMUNE: "Numune / Görsel",
  DIGER: "Diğer",
};
export const LISTING_DOC_KINDS = Object.keys(
  LISTING_DOC_KIND_LABELS,
) as ListingDocKind[];

export interface ListingDocument {
  id: string;
  kind: ListingDocKind;
  fileName: string;
  mimeType: string;
  createdAt: string;
  mine: boolean;
  url: string;
}

export function useListingDocuments(listingId: string, enabled = true) {
  return useQuery({
    queryKey: ["listing-documents", listingId],
    // Maskeli önizlemede çağrı yapılmaz — uç 404 döner (şartname gizli).
    enabled: !!listingId && enabled,
    queryFn: async () => {
      const { data } = await companyApi.get<ListingDocument[]>(
        `/company/listings/${listingId}/documents`,
      );
      return data;
    },
  });
}

/**
 * Tek dosya yükleme (presigned R2 PUT + kayıt). Hook dışında da kullanılır —
 * wizard, ilan oluşturulduktan hemen sonra staged dosyaları bununla yükler.
 */
export async function uploadListingDocument(
  listingId: string,
  file: File,
  kind: ListingDocKind,
): Promise<void> {
  const { data } = await companyApi.post<{ url: string; key: string }>(
    `/company/listings/${listingId}/documents/upload-url`,
    { fileName: file.name, mimeType: file.type, fileSize: file.size },
  );
  const put = await fetch(data.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Dosya yüklenemedi (R2)");
  await companyApi.post(`/company/listings/${listingId}/documents`, {
    key: data.key,
    fileName: file.name,
    mimeType: file.type,
    kind,
  });
}

export function useUploadListingDoc(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ file, kind }: { file: File; kind: ListingDocKind }) =>
      uploadListingDocument(listingId, file, kind),
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["listing-documents", listingId] }),
  });
}

export function useDeleteListingDoc(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (docId: string) => {
      await companyApi.delete(
        `/company/listings/${listingId}/documents/${docId}`,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["listing-documents", listingId] }),
  });
}
