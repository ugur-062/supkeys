"use client";

import { companyApi } from "@/lib/company-auth/api";
import type {
  AiActionResult,
  AiAssistantReply,
  AiChatSessionDetailDto,
  AiChatSessionSummaryDto,
} from "@rothern/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

/**
 * Faz AI-2 — asistan sohbeti. Mesaj gönderme (mutation) + oturum listesi/geçmiş
 * (query). Streaming yok — tek yanıt (araç döngüsü backend'de tamamlanır).
 */

export function useAssistantSessions(enabled: boolean) {
  return useQuery({
    queryKey: ["ai-assistant-sessions"],
    queryFn: async () => {
      const { data } = await companyApi.get<AiChatSessionSummaryDto[]>(
        "/company/ai/assistant/sessions",
      );
      return data;
    },
    enabled,
    placeholderData: (prev) => prev,
  });
}

export function useAssistantSession(sessionId: string | null) {
  return useQuery({
    queryKey: ["ai-assistant-session", sessionId],
    queryFn: async () => {
      const { data } = await companyApi.get<AiChatSessionDetailDto>(
        `/company/ai/assistant/sessions/${sessionId}`,
      );
      return data;
    },
    enabled: !!sessionId,
  });
}

/** Faz AI-3 — asistan içinden belge yükleme: presigned PUT + fileKeys döner. */
async function uploadTenderFile(file: File): Promise<string> {
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

export function useSendAssistantMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sessionId?: string;
      message: string;
      files?: File[];
    }) => {
      // AI-3: dosyalar varsa önce presigned yükle → fileKeys.
      const fileKeys: string[] = [];
      for (const f of input.files ?? []) fileKeys.push(await uploadTenderFile(f));
      const { data } = await companyApi.post<AiAssistantReply>(
        "/company/ai/assistant/message",
        {
          sessionId: input.sessionId,
          message: input.message,
          ...(fileKeys.length > 0 ? { fileKeys } : {}),
        },
        // Araç döngüsü + belge çıkarımı global 45sn'yi aşabilir; backend tur
        // deadline'ı (90sn) her durumda bundan önce yanıt verir.
        { timeout: 180_000 },
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
      qc.invalidateQueries({ queryKey: ["company-ai-usage"] });
    },
  });
}

/**
 * AI-4 — onay kartı: yürütme YALNIZ bu kullanıcı-jesti mutasyonuyla olur
 * (model onaylayamaz). decision=confirm → işlem gerçekleşir; reject → iptal.
 */
export function useAssistantAction() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      sessionId: string;
      actionId: string;
      decision: "confirm" | "reject";
    }) => {
      const { data } = await companyApi.post<AiActionResult>(
        `/company/ai/assistant/sessions/${input.sessionId}/actions/${input.actionId}/${input.decision}`,
        {},
        { timeout: 60_000 },
      );
      return data;
    },
    onSuccess: () => {
      // Yayınlanan ihale / gönderilen davet listelerde görünsün.
      qc.invalidateQueries({ queryKey: ["company-listings"] });
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
    },
  });
}

export function useDeleteAssistantSession() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (sessionId: string) => {
      await companyApi.delete(`/company/ai/assistant/sessions/${sessionId}`);
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] }),
  });
}
