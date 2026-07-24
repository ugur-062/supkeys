"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { AiTenderExtractResult } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";

/**
 * Faz AI-1 — belge → ihale formu. Akış: presigned PUT (dosya API'den geçmez) →
 * extract (backend işler + Gemini). refine yalnız taslak JSON + mesaj gönderir
 * (belge yeniden okunmaz — "bir kez oku, JSON'la konuş").
 */

async function uploadOne(file: File): Promise<string> {
  const { data: presigned } = await companyApi.post<{ url: string; key: string }>(
    "/company/ai/uploads/url",
    { fileName: file.name, mimeType: file.type, fileSize: file.size },
  );
  const put = await fetch(presigned.url, {
    method: "PUT",
    body: file,
    headers: { "Content-Type": file.type },
  });
  if (!put.ok) throw new Error("Dosya yüklenemedi — lütfen tekrar deneyin");
  return presigned.key;
}

export function useAiTenderExtract() {
  return useMutation({
    mutationFn: async ({
      files,
      listingType,
    }: {
      files: File[];
      listingType: "ALIM" | "SATIS";
    }) => {
      const fileKeys: string[] = [];
      for (const f of files) fileKeys.push(await uploadOne(f));
      const { data } = await companyApi.post<AiTenderExtractResult>(
        "/company/ai/tender-extract",
        { fileKeys, listingType },
      );
      return data;
    },
  });
}

export function useAiTenderRefine() {
  return useMutation({
    mutationFn: async ({
      draft,
      message,
    }: {
      draft: AiTenderExtractResult["draft"];
      message: string;
    }) => {
      const { data } = await companyApi.post<AiTenderExtractResult>(
        "/company/ai/tender-refine",
        { draft, message },
      );
      return data;
    },
  });
}
