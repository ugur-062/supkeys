"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

export type DocKind =
  | "taxPlate"
  | "tradeRegistry"
  | "signatureCircular"
  | "activityCert"
  | "idFront"
  | "idBack";

/**
 * Ülke + zorunlu kind listesine göre etiketli belge listesi (dil bilir).
 *
 * Etiketler katalogda: `web.panel.settings.companyDocs.tr.<kind>` ve
 * `…foreign.<kind>`. İki küme AYNI alanların farklı anlamıdır — yabancı
 * kümede resmî İngilizce ad parantezde durur ki kullanıcı elindeki belgeyi
 * tanısın.
 */
export function useDocLabels(): (
  country: string | null | undefined,
  required: DocKind[],
) => { key: DocKind; label: string }[] {
  const t = useTranslations("web.panel.settings.companyDocs");
  return (country, required) => {
    const group = (country ?? "TR").toUpperCase() === "TR" ? "tr" : "foreign";
    return required.map((k) => ({ key: k, label: t(`${group}.${k}` as never) }));
  };
}

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

// Belge bazlı inceleme durumu (admin her belgeyi ayrı onaylar/reddeder).
export type DocStatus = "PENDING" | "APPROVED" | "REJECTED";

export interface KycFields {
  mersisNo: string | null;
  tradeRegistryNo: string | null;
  iban: string | null;
  ibanHolder: string | null;
}

/** Faz Y A-modeli — VERIFIED-sonrası belge güncellemesinin son revizyonu. */
export interface DocRevision {
  status: DocStatus;
  reason: string | null;
  createdAt: string;
  url: string | null;
}

export interface CompanyDocs extends KycFields {
  status: VerificationStatus;
  verifiedAt: string | null;
  rejectionReason: string | null;
  country: string | null;
  docs: Record<DocKind, string | null>;
  // Belge bazlı inceleme durumu + red gerekçesi.
  docStatus: Record<DocKind, DocStatus>;
  docReason: Record<DocKind, string | null>;
  required: DocKind[];
  // Kind başına SON revizyon (yalnız VERIFIED-sonrası akışta dolar).
  revisions: Record<DocKind, DocRevision | null>;
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
  const t = useTranslations("web.panel.settings.companyDocs");
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
      if (!put.ok) throw new Error(t("yuklemeBasarisiz"));
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
    mutationFn: async (kyc: Partial<KycFields>) => {
      const { data } = await companyApi.post("/company/docs/submit", kyc);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-docs"] }),
  });
}
