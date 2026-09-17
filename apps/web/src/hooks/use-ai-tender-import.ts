"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { AiTenderExtractResult } from "@rothern/shared";
import { useMutation } from "@tanstack/react-query";

/**
 * Faz AI-1 — belge → talep formu. Akış: presigned PUT (dosya API'den geçmez) →
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
    mutationFn: async ({ files }: { files: File[] }) => {
      const fileKeys: string[] = [];
      for (const f of files) fileKeys.push(await uploadOne(f));
      const { data } = await companyApi.post<AiTenderExtractResult>(
        "/company/ai/tender-extract",
        { fileKeys, listingType: "ALIM" },
        // Vision çıkarımı (çok sayfalı PDF) global 45sn'yi aşabilir.
        { timeout: 180_000 },
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
        { timeout: 180_000 },
      );
      return data;
    },
  });
}


/**
 * AI ile BAŞLIK + KATEGORİ (2026-09-17, kullanıcı kararı): hızlı talep
 * formunda tek düğme; iki uç paralel çağrılır (`tender-extract/title-suggest`
 * + `tender-extract/category-suggest`). Biri düşerse öbürü yine uygulanır.
 */
export function useAiRequestDraftSuggest() {
  return useMutation({
    mutationFn: async (items: { name: string; quantity?: number; unit?: string; description?: string }[]) => {
      const named = items.filter((i) => (i.name ?? "").trim().length >= 2);
      const [title, cat] = await Promise.allSettled([
        companyApi.post<{ title: string | null }>("/company/ai/tender-extract/title-suggest", {
          items: named.map((i) => ({ name: i.name.trim(), quantity: i.quantity, unit: i.unit })),
        }),
        companyApi.post<{ categoryIds: string[]; keywords?: string[] }>(
          "/company/ai/tender-extract/category-suggest",
          { items: named.map((i) => ({ name: i.name.trim(), description: i.description })) },
        ),
      ]);
      return {
        title: title.status === "fulfilled" ? (title.value.data?.title ?? null) : null,
        categoryIds: cat.status === "fulfilled" ? (cat.value.data?.categoryIds ?? []) : [],
        keywords: cat.status === "fulfilled" ? (cat.value.data?.keywords ?? []) : [],
        failed: title.status === "rejected" && cat.status === "rejected",
      };
    },
  });
}
