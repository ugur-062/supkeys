"use client";

import type { AnswerTypeValue } from "@/lib/tenders/form-schema";
import { useQuery } from "@tanstack/react-query";

/**
 * Soru şablonu kütüphanesi — eski sistemde kayıtlı soru setleri vardı. Yeni
 * sistemde henüz backend yok; şimdilik boş döner (modal "kayıtlı şablon yok"
 * gösterir). İleride bir backend'e bağlanabilir.
 */
export interface QuestionTemplateSummary {
  id: string;
  name: string;
  itemCount: number;
}

export interface QuestionTemplateDetail {
  id: string;
  items: Array<{
    id: string;
    text: string;
    answerType: AnswerTypeValue;
    required: boolean;
  }>;
}

export function useQuestionTemplates() {
  return useQuery<QuestionTemplateSummary[]>({
    queryKey: ["question-templates"],
    queryFn: async () => [],
    staleTime: Infinity,
  });
}

export function useQuestionTemplate(id: string | null) {
  return useQuery<QuestionTemplateDetail | null>({
    queryKey: ["question-template", id],
    queryFn: async () => null,
    enabled: !!id,
  });
}
