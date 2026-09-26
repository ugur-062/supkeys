"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { BidImportResult } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";
import { useTranslations } from "next-intl";

/**
 * Teklif fiyatı içe aktarma (Faz 2, 2026-08-22). İki yol, tek önizleme sözleşmesi
 * (BidImportResult): şablon (AI'sız, base64 gövde) + belge (AI; presign → extract).
 * Hiçbiri teklif YAZMAZ — "Forma uygula" itemState'i doldurur, gönderme ayrı.
 */

/** `readError`: kullanıcıya gösterilecek metin — çağıran hook çevirir. */
function fileToBase64(file: File, readError: string): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error(readError));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

export function useDownloadBidTemplate(listingId: string) {
  return useMutation({
    mutationFn: async () => {
      const res = await companyApi.get(`/company/listings/${listingId}/bid-import/template`, {
        responseType: "blob",
      });
      const dispo = String(res.headers["content-disposition"] ?? "");
      const match = /filename="?([^";]+)"?/.exec(dispo);
      let filename = "teklif-sablonu.xlsx";
      if (match?.[1]) {
        try {
          filename = decodeURIComponent(match[1]);
        } catch {
          filename = match[1];
        }
      }
      const url = URL.createObjectURL(res.data as Blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      a.click();
      URL.revokeObjectURL(url);
      return { filename };
    },
  });
}

export function useParseBidTemplate(listingId: string) {
  const t = useTranslations("web.panel.trade.bidImport");
  return useMutation({
    mutationFn: async (file: File) => {
      const dataBase64 = await fileToBase64(file, t("dosyaOkunamadi"));
      const { data } = await companyApi.post<BidImportResult>(
        `/company/listings/${listingId}/bid-import/parse`,
        { fileName: file.name, mimeType: file.type || "application/octet-stream", dataBase64 },
        { timeout: 60_000 },
      );
      return data;
    },
  });
}

/** `uploadError`: kullanıcıya gösterilecek metin — çağıran hook çevirir. */
async function uploadOne(file: File, uploadError: string): Promise<string> {
  const { data: presigned } = await companyApi.post<{ url: string; key: string }>(
    "/company/ai/uploads/url",
    { fileName: file.name, mimeType: file.type, fileSize: file.size },
  );
  const put = await fetch(presigned.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error(uploadError);
  return presigned.key;
}

export function useAiBidPriceExtract(listingId: string) {
  const t = useTranslations("web.panel.trade.bidImport");
  return useMutation({
    mutationFn: async (files: File[]) => {
      const fileKeys: string[] = [];
      for (const f of files) fileKeys.push(await uploadOne(f, t("dosyaYuklenemedi")));
      const { data } = await companyApi.post<BidImportResult>(
        "/company/ai/bid-price-extract",
        { listingId, fileKeys },
        { timeout: 180_000 },
      );
      return data;
    },
  });
}
