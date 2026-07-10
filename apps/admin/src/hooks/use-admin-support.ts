"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── Dahili notlar ────────────────────────────────────────────

export interface AdminNote {
  id: string;
  body: string;
  adminEmail: string | null;
  createdAt: string;
}

export function useCompanyNotes(companyId: string) {
  return useQuery({
    queryKey: ["admin-company-notes", companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminNote[]>(
        `/admin/companies/${companyId}/notes`,
      );
      return data;
    },
  });
}

export function useAddNote(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ body }: { body: string }) => {
      await api.post(`/admin/companies/${companyId}/notes`, { body });
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-company-notes", companyId] }),
  });
}

export function useDeleteNote(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ noteId }: { noteId: string }) => {
      await api.delete(`/admin/notes/${noteId}`);
    },
    onSuccess: () =>
      qc.invalidateQueries({ queryKey: ["admin-company-notes", companyId] }),
  });
}

// ── Global arama ─────────────────────────────────────────────

export interface GlobalSearchResult {
  companies: {
    id: string;
    name: string;
    rothernId: string | null;
    country: string;
    tier: string;
    isBlocked: boolean;
  }[];
  users: {
    id: string;
    email: string;
    name: string;
    companyId: string;
    companyName: string;
  }[];
}

export function useGlobalSearch(q: string) {
  return useQuery({
    queryKey: ["admin-global-search", q],
    enabled: q.trim().length >= 2,
    queryFn: async () => {
      const { data } = await api.get<GlobalSearchResult>("/admin/search", {
        params: { q },
      });
      return data;
    },
    staleTime: 10_000,
  });
}

// ── Bildirim + duyuru ────────────────────────────────────────

export function useNotifyCompany(companyId: string) {
  return useMutation({
    mutationFn: async (input: { subject: string; message: string }) => {
      await api.post(`/admin/companies/${companyId}/notify`, input);
    },
  });
}

export function useAnnounce() {
  return useMutation({
    mutationFn: async (input: {
      subject: string;
      message: string;
      tier?: "PAKET" | "STANDARD";
      country?: string;
      sendEmail?: boolean;
    }) => {
      const { data } = await api.post<{
        ok: boolean;
        targets: number;
        delivered: number;
      }>("/admin/announcements", input);
      return data;
    },
  });
}
