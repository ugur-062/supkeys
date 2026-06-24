"use client";

import { api } from "@/lib/api";
import { useQuery } from "@tanstack/react-query";

export interface ThreadListItem {
  id: string;
  lastMessageAt: string | null;
  tenant: { id: string; name: string };
  supplier: { id: string; companyName: string };
  messageCount: number;
  lastMessage: {
    preview: string;
    senderType: string;
    sentAt: string;
  } | null;
}

export interface ThreadDetail {
  id: string;
  tenant: { id: string; name: string };
  supplier: { id: string; companyName: string };
  messages: Array<{
    id: string;
    content: string;
    senderType: "TENANT_USER" | "SUPPLIER_USER";
    senderName: string;
    context: string | null;
    contextRefId: string | null;
    sentAt: string;
  }>;
}

export function useAdminThreads(params: { search?: string; page?: number } = {}) {
  const qs = new URLSearchParams();
  if (params.search) qs.set("search", params.search);
  if (params.page) qs.set("page", String(params.page));
  const q = qs.toString();
  return useQuery({
    queryKey: ["admin", "threads", params],
    queryFn: async () => {
      const { data } = await api.get<{
        items: ThreadListItem[];
        pagination: { page: number; pageSize: number; total: number; totalPages: number };
      }>(`/admin/threads${q ? `?${q}` : ""}`);
      return data;
    },
    placeholderData: (prev) => prev,
    staleTime: 15_000,
  });
}

export function useAdminThread(id: string | null | undefined) {
  return useQuery({
    queryKey: ["admin", "thread", id ?? ""],
    queryFn: async () => {
      const { data } = await api.get<ThreadDetail>(`/admin/threads/${id}`);
      return data;
    },
    enabled: Boolean(id),
    staleTime: 15_000,
  });
}
