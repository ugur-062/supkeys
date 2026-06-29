"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export type DocKind =
  | "taxPlate"
  | "tradeRegistry"
  | "signatureCircular"
  | "activityCert"
  | "idFront"
  | "idBack";

export const DOC_LABELS: { key: DocKind; label: string }[] = [
  { key: "taxPlate", label: "Vergi Levhası" },
  { key: "tradeRegistry", label: "Ticaret Sicil Gazetesi" },
  { key: "signatureCircular", label: "İmza Sirküleri" },
  { key: "activityCert", label: "Faaliyet Belgesi" },
  { key: "idFront", label: "Yetkili Kimlik (Ön)" },
  { key: "idBack", label: "Yetkili Kimlik (Arka)" },
];

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface CompanyDocs {
  status: VerificationStatus;
  verifiedAt: string | null;
  docs: Record<DocKind, string | null>;
  required: DocKind[];
}

export function useCompanyDocs() {
  return useQuery({
    queryKey: ["company-docs"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyDocs>("/company/docs");
      return data;
    },
  });
}

export function useUploadDoc() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ kind, file }: { kind: DocKind; file: File }) => {
      const { data: presigned } = await companyApi.post<{
        url: string;
        key: string;
      }>("/company/docs/upload-url", {
        kind,
        fileName: file.name,
        mimeType: file.type,
      });
      const put = await fetch(presigned.url, {
        method: "PUT",
        body: file,
        headers: { "Content-Type": file.type },
      });
      if (!put.ok) throw new Error("Yükleme başarısız");
      const { data } = await companyApi.post("/company/docs/commit", {
        kind,
        key: presigned.key,
      });
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-docs"] }),
  });
}

export function useSubmitDocs() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      const { data } = await companyApi.post("/company/docs/submit");
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-docs"] }),
  });
}
