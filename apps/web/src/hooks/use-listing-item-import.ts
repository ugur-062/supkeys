"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { ItemImportResult } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";

/**
 * Kalem Excel içe aktarma (2026-08-22) — AI YOK, deterministik, her pakete
 * açık. Şablon indir (blob) + doldurulmuş dosyayı base64 gövdeyle gönder →
 * yalnız ÖNİZLEME döner (hiçbir şey yazılmaz; kalemler forma kullanıcı
 * "Aktar" deyince girer, ihale normal Yayınla ile açılır).
 */

export interface ItemImportScope {
  listingType: "ALIM" | "SATIS";
  priceScope?: "TOPLU" | "KALEM";
}

export function useDownloadItemTemplate() {
  return useMutation({
    mutationFn: async (scope: ItemImportScope) => {
      const res = await companyApi.get("/company/listing-item-import/template", {
        params: scope,
        responseType: "blob",
      });
      const dispo = String(res.headers["content-disposition"] ?? "");
      const match = /filename="?([^";]+)"?/.exec(dispo);
      const filename = match?.[1] ?? "kalem-sablonu.xlsx";
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

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Dosya okunamadı"));
    reader.onload = () => {
      const s = String(reader.result ?? "");
      resolve(s.includes(",") ? s.slice(s.indexOf(",") + 1) : s);
    };
    reader.readAsDataURL(file);
  });
}

export function useParseItemImport() {
  return useMutation({
    mutationFn: async ({ file, scope }: { file: File; scope: ItemImportScope }) => {
      const dataBase64 = await fileToBase64(file);
      const { data } = await companyApi.post<ItemImportResult>(
        "/company/listing-item-import/parse",
        {
          fileName: file.name,
          mimeType: file.type || "application/octet-stream",
          dataBase64,
          ...scope,
        },
        { timeout: 60_000 },
      );
      return data;
    },
  });
}
