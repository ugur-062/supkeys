"use client";

// V2-7+ — Şablon hook'ları (Kalem Sorusu + Tedarikçi).

import { api } from "@/lib/api";
import type {
  QuestionAnswerType,
  QuestionTemplateDetail,
  QuestionTemplateListItem,
  SupplierTemplateDetail,
  SupplierTemplateListItem,
} from "@/lib/templates/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  questions: ["templates", "questions"] as const,
  question: (id: string) => ["templates", "question", id] as const,
  suppliers: ["templates", "suppliers"] as const,
  supplier: (id: string) => ["templates", "supplier", id] as const,
};

// ----------------- KALEM SORUSU -----------------

export function useQuestionTemplates() {
  return useQuery({
    queryKey: KEYS.questions,
    queryFn: async () => {
      const { data } = await api.get<QuestionTemplateListItem[]>(
        "/tenants/me/templates/item-questions",
      );
      return data;
    },
  });
}

export function useQuestionTemplate(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.question(id) : ["templates", "question", "noop"],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<QuestionTemplateDetail>(
        `/tenants/me/templates/item-questions/${id}`,
      );
      return data;
    },
  });
}

export interface QuestionTemplatePayload {
  name: string;
  isPublic: boolean;
  autoApply: boolean;
  items: Array<{
    text: string;
    required: boolean;
    answerType: QuestionAnswerType;
  }>;
}

export function useCreateQuestionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: QuestionTemplatePayload) => {
      const { data } = await api.post<QuestionTemplateDetail>(
        "/tenants/me/templates/item-questions",
        payload,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.questions }),
  });
}

export function useDeleteQuestionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ id: string }>(
        `/tenants/me/templates/item-questions/${id}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.questions }),
  });
}

// ----------------- TEDARİKÇİ -----------------

export function useSupplierTemplates() {
  return useQuery({
    queryKey: KEYS.suppliers,
    queryFn: async () => {
      const { data } = await api.get<SupplierTemplateListItem[]>(
        "/tenants/me/templates/suppliers",
      );
      return data;
    },
  });
}

export function useSupplierTemplate(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.supplier(id) : ["templates", "supplier", "noop"],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<SupplierTemplateDetail>(
        `/tenants/me/templates/suppliers/${id}`,
      );
      return data;
    },
  });
}

export interface SupplierTemplatePayload {
  name: string;
  isPublic: boolean;
  supplierIds: string[];
}

export function useCreateSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SupplierTemplatePayload) => {
      const { data } = await api.post<SupplierTemplateDetail>(
        "/tenants/me/templates/suppliers",
        payload,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.suppliers }),
  });
}

export function useDeleteSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ id: string }>(
        `/tenants/me/templates/suppliers/${id}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.suppliers }),
  });
}
