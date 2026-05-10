"use client";

import { api } from "@/lib/api";
import type {
  MessageContext,
  MessageSurface,
  SendMessagePayload,
  ThreadMessagesResponse,
  TenderThreadSummary,
} from "@/lib/messages/types";
import { supplierApi } from "@/lib/supplier-auth/api";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";
import type { AxiosInstance } from "axios";

/**
 * V2-4 — Mesajlaşma hook'ları (surface-aware: tenant/supplier).
 *
 * Path matrix:
 *   tenant + ORDER  → /tenants/me/orders/:id/messages
 *   tenant + TENDER → /tenants/me/tenders/:id/threads/:supplierId/messages
 *   supplier + ORDER  → /supplier/orders/:id/messages
 *   supplier + TENDER → /supplier/tenders/:id/messages (tek thread)
 */

function clientFor(surface: MessageSurface): AxiosInstance {
  return surface === "tenant" ? api : supplierApi;
}

function pathFor(
  surface: MessageSurface,
  context: MessageContext,
  contextRefId: string,
  targetSupplierId?: string,
): string {
  if (surface === "tenant") {
    if (context === "ORDER") {
      return `/tenants/me/orders/${contextRefId}/messages`;
    }
    if (!targetSupplierId) {
      throw new Error("Tenant + TENDER context için targetSupplierId şart");
    }
    return `/tenants/me/tenders/${contextRefId}/threads/${targetSupplierId}/messages`;
  }
  if (context === "ORDER") {
    return `/supplier/orders/${contextRefId}/messages`;
  }
  return `/supplier/tenders/${contextRefId}/messages`;
}

const KEYS = {
  thread: (
    surface: MessageSurface,
    context: MessageContext,
    refId: string,
    targetSupplierId?: string,
  ) => ["messages", surface, context, refId, targetSupplierId ?? null] as const,
  tenderThreads: (tenderId: string) =>
    ["tender-threads", tenderId] as const,
  unread: (surface: MessageSurface) =>
    ["messages-unread", surface] as const,
};

export function useThreadMessages(
  surface: MessageSurface,
  context: MessageContext,
  contextRefId: string | undefined,
  targetSupplierId?: string,
) {
  const enabled =
    !!contextRefId &&
    (surface === "supplier" || context === "ORDER" || !!targetSupplierId);

  return useQuery<ThreadMessagesResponse>({
    queryKey: KEYS.thread(
      surface,
      context,
      contextRefId ?? "",
      targetSupplierId,
    ),
    queryFn: async () => {
      const path = pathFor(
        surface,
        context,
        contextRefId!,
        targetSupplierId,
      );
      const { data } = await clientFor(surface).get<ThreadMessagesResponse>(
        path,
      );
      return data;
    },
    enabled,
    refetchInterval: 30_000,
  });
}

export function useSendMessage(
  surface: MessageSurface,
  context: MessageContext,
  contextRefId: string,
  targetSupplierId?: string,
) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const path = pathFor(surface, context, contextRefId, targetSupplierId);
      const { data } = await clientFor(surface).post(path, payload);
      return data;
    },
    onSuccess: () => {
      qc.invalidateQueries({
        queryKey: KEYS.thread(surface, context, contextRefId, targetSupplierId),
      });
      qc.invalidateQueries({ queryKey: KEYS.unread(surface) });
      // Tenant-tender thread listesi de değişebilir (lastMessageAt vs.)
      if (surface === "tenant" && context === "TENDER") {
        qc.invalidateQueries({ queryKey: KEYS.tenderThreads(contextRefId) });
      }
    },
  });
}

export function useTenderThreadsForTenant(tenderId: string | undefined) {
  return useQuery<TenderThreadSummary[]>({
    queryKey: KEYS.tenderThreads(tenderId ?? ""),
    queryFn: async () => {
      const { data } = await api.get<TenderThreadSummary[]>(
        `/tenants/me/tenders/${tenderId}/threads`,
      );
      return data;
    },
    enabled: !!tenderId,
    refetchInterval: 30_000,
  });
}

export function useUnreadCount(surface: MessageSurface) {
  return useQuery<{ count: number }>({
    queryKey: KEYS.unread(surface),
    queryFn: async () => {
      const path =
        surface === "tenant"
          ? "/tenants/me/messages/unread-count"
          : "/supplier/messages/unread-count";
      const { data } = await clientFor(surface).get<{ count: number }>(path);
      return data;
    },
    refetchInterval: 60_000,
    staleTime: 30_000,
  });
}
