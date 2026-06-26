"use client";

import { companyApi } from "@/lib/company-auth/api";
import type { AnswerTypeValue } from "@/lib/tenders/form-schema";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface QuestionTemplateSummary {
  id: string;
  name: string;
  itemCount: number;
}

export interface QuestionTemplateItem {
  id: string;
  text: string;
  answerType: AnswerTypeValue;
  required: boolean;
}

export interface QuestionTemplateDetail {
  id: string;
  name: string;
  items: QuestionTemplateItem[];
}

export function useQuestionTemplates() {
  return useQuery<QuestionTemplateSummary[]>({
    queryKey: ["question-templates"],
    queryFn: async () => {
      const { data } = await companyApi.get<QuestionTemplateSummary[]>(
        "/company/question-templates",
      );
      return data;
    },
  });
}

export function useQuestionTemplate(id: string | null) {
  return useQuery<QuestionTemplateDetail | null>({
    queryKey: ["question-template", id],
    queryFn: async () => {
      const { data } = await companyApi.get<QuestionTemplateDetail>(
        `/company/question-templates/${id}`,
      );
      return data;
    },
    enabled: !!id,
  });
}

export function useSaveQuestionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      items: Array<{
        text: string;
        answerType: AnswerTypeValue;
        required: boolean;
      }>;
    }) => {
      const { data } = await companyApi.post(
        "/company/question-templates",
        input,
      );
      return data;
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["question-templates"] }),
  });
}
