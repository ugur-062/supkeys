"use client";

import { companyApi } from "@/lib/company-auth/api";
import type {
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

export function useSendAssistantMessage() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: { sessionId?: string; message: string }) => {
      const { data } = await companyApi.post<AiAssistantReply>(
        "/company/ai/assistant/message",
        input,
      );
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["ai-assistant-sessions"] });
      qc.invalidateQueries({ queryKey: ["company-ai-usage"] });
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
