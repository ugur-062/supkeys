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

// TR belge etiketleri.
const DOC_LABELS_TR: Record<DocKind, string> = {
  taxPlate: "Vergi Levhası",
  tradeRegistry: "Ticaret Sicil Gazetesi",
  signatureCircular: "İmza Sirküleri",
  activityCert: "Faaliyet Belgesi",
  idFront: "Yetkili Kimlik (Ön)",
  idBack: "Yetkili Kimlik (Arka)",
};
// Yabancı belge etiketleri (aynı alanlar, farklı anlam).
const DOC_LABELS_FOREIGN: Record<DocKind, string> = {
  tradeRegistry: "Certificate of Incorporation",
  taxPlate: "Tax / VAT Certificate",
  idFront: "Authorized Signatory ID",
  signatureCircular: "İmza Sirküleri",
  activityCert: "Faaliyet Belgesi",
  idBack: "Yetkili Kimlik (Arka)",
};

/** Ülke + zorunlu kind listesine göre etiketli belge listesi. */
export function docLabels(
  country: string | null | undefined,
  required: DocKind[],
): { key: DocKind; label: string }[] {
  const map = (country ?? "TR").toUpperCase() === "TR" ? DOC_LABELS_TR : DOC_LABELS_FOREIGN;
  return required.map((k) => ({ key: k, label: map[k] }));
}

// Geriye dönük uyumluluk (TR tam liste).
export const DOC_LABELS: { key: DocKind; label: string }[] = (
  ["taxPlate", "tradeRegistry", "signatureCircular", "activityCert", "idFront", "idBack"] as DocKind[]
).map((k) => ({ key: k, label: DOC_LABELS_TR[k] }));

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface CompanyDocs {
  status: VerificationStatus;
  verifiedAt: string | null;
  country: string | null;
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
        fileSize: file.size,
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
