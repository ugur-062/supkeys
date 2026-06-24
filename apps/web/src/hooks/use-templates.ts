"use client";

// V2-7+ — Şablon hook'ları (Kalem Sorusu + Tedarikçi).

import { api } from "@/lib/api";
import type {
  QuestionAnswerType,
  QuestionTemplateDetail,
  QuestionTemplateListItem,
  SupplierTemplateDetail,
  SupplierTemplateListItem,
  TenderTemplateDetail,
  TenderTemplateListItem,
} from "@/lib/templates/types";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

const KEYS = {
  questions: ["templates", "questions"] as const,
  question: (id: string) => ["templates", "question", id] as const,
  suppliers: ["templates", "suppliers"] as const,
  supplier: (id: string) => ["templates", "supplier", id] as const,
  tenders: ["templates", "tenders"] as const,
  tender: (id: string) => ["templates", "tender", id] as const,
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

export function useUpdateQuestionTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: QuestionTemplatePayload;
    }) => {
      const { data } = await api.patch<QuestionTemplateDetail>(
        `/tenants/me/templates/item-questions/${id}`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.questions });
      qc.invalidateQueries({ queryKey: KEYS.question(id) });
    },
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

export function useUpdateSupplierTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      id,
      payload,
    }: {
      id: string;
      payload: SupplierTemplatePayload;
    }) => {
      const { data } = await api.patch<SupplierTemplateDetail>(
        `/tenants/me/templates/suppliers/${id}`,
        payload,
      );
      return data;
    },
    onSuccess: (_data, { id }) => {
      qc.invalidateQueries({ queryKey: KEYS.suppliers });
      qc.invalidateQueries({ queryKey: KEYS.supplier(id) });
    },
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

// ----------------- İHALE ŞABLONU (madde 34) -----------------

export function useTenderTemplates() {
  return useQuery({
    queryKey: KEYS.tenders,
    queryFn: async () => {
      const { data } = await api.get<TenderTemplateListItem[]>(
        "/tenants/me/templates/tenders",
      );
      return data;
    },
  });
}

export function useTenderTemplate(id: string | null) {
  return useQuery({
    queryKey: id ? KEYS.tender(id) : ["templates", "tender", "noop"],
    enabled: !!id,
    queryFn: async () => {
      const { data } = await api.get<TenderTemplateDetail>(
        `/tenants/me/templates/tenders/${id}`,
      );
      return data;
    },
  });
}

export function useCreateTenderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (input: {
      name: string;
      data: Record<string, unknown>;
    }) => {
      const { data } = await api.post<{ id: string; name: string }>(
        "/tenants/me/templates/tenders",
        input,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tenders }),
  });
}

export function useDeleteTenderTemplate() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (id: string) => {
      const { data } = await api.delete<{ id: string }>(
        `/tenants/me/templates/tenders/${id}`,
      );
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: KEYS.tenders }),
  });
}
