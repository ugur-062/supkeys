"use client";

import { api } from "@/lib/api";
import type {
  AllThreadSummary,
  ContactSummary,
  MessageContext,
  MessageItem,
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
 *
 * Polling 5 saniye + staleTime 0 + window focus + mount'ta force refetch.
 * Kullanıcı sayfa yenilemeden karşı tarafın mesajını ~5 saniye içinde görür.
 */

const POLLING_MS = 5_000;

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
    if (context === "DIRECT") {
      // contextRefId = supplierId (tenant perspektifinden DIRECT)
      return `/tenants/me/suppliers/${contextRefId}/messages`;
    }
    if (!targetSupplierId) {
      throw new Error("Tenant + TENDER context için targetSupplierId şart");
    }
    return `/tenants/me/tenders/${contextRefId}/threads/${targetSupplierId}/messages`;
  }
  if (context === "ORDER") {
    return `/supplier/orders/${contextRefId}/messages`;
  }
  if (context === "DIRECT") {
    // contextRefId = tenantId (supplier perspektifinden DIRECT)
    return `/supplier/tenants/${contextRefId}/messages`;
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
  tenderThreads: (tenantTenderId: string) =>
    ["tender-threads", tenantTenderId] as const,
  allThreads: (surface: MessageSurface) =>
    ["messages-all-threads", surface] as const,
  contacts: (surface: MessageSurface) =>
    ["messages-contacts", surface] as const,
  unread: (surface: MessageSurface) =>
    ["messages-unread", surface] as const,
};

/**
 * Tüm mesajlaşma query'lerinin paylaştığı taze-veri konfigürasyonu.
 * Mesajlaşma için cache yok — her render'da fresh çek.
 */
const LIVE_QUERY_OPTIONS = {
  refetchInterval: POLLING_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnMount: "always" as const,
  refetchOnReconnect: true,
  staleTime: 0,
};

/**
 * V2-4.1 — /mesajlar sayfası kontak listesi (ACTIVE relations + DIRECT
 * thread özeti). Hiç mesajlaşmamış olanlar da listelenir.
 */
export function useContacts(surface: MessageSurface) {
  return useQuery<ContactSummary[]>({
    queryKey: KEYS.contacts(surface),
    queryFn: async () => {
      const path =
        surface === "tenant" ? "/tenants/me/contacts" : "/supplier/contacts";
      const { data } = await clientFor(surface).get<ContactSummary[]>(path);
      return data;
    },
    ...LIVE_QUERY_OPTIONS,
  });
}

/**
 * V2-4 — Header dropdown için tüm thread'lerin özeti (TENDER + ORDER + DIRECT).
 */
export function useAllThreads(surface: MessageSurface) {
  return useQuery<AllThreadSummary[]>({
    queryKey: KEYS.allThreads(surface),
    queryFn: async () => {
      const path =
        surface === "tenant" ? "/tenants/me/threads" : "/supplier/threads";
      const { data } = await clientFor(surface).get<AllThreadSummary[]>(path);
      return data;
    },
    ...LIVE_QUERY_OPTIONS,
  });
}

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
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useSendMessage(
  surface: MessageSurface,
  context: MessageContext,
  contextRefId: string,
  targetSupplierId?: string,
) {
  const qc = useQueryClient();
  const queryKey = KEYS.thread(
    surface,
    context,
    contextRefId,
    targetSupplierId,
  );
  const senderType = surface === "tenant" ? "TENANT_USER" : "SUPPLIER_USER";

  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const path = pathFor(surface, context, contextRefId, targetSupplierId);
      const { data } = await clientFor(surface).post(path, payload);
      return data;
    },

    /**
     * Optimistic update — kendi mesajın server response'unu beklemeden
     * anında balona düşer. Hata olursa rollback (onError).
     */
    onMutate: async (payload) => {
      await qc.cancelQueries({ queryKey });
      const previous = qc.getQueryData<ThreadMessagesResponse>(queryKey);

      const optimistic: MessageItem = {
        id: `temp-${Date.now()}`,
        threadId: previous?.thread.id ?? "",
        senderType,
        senderUserId: null,
        senderSupplierUserId: null,
        senderName: "Sen",
        content: payload.content,
        attachmentIds: payload.attachmentIds ?? [],
        emailNotifiedAt: null,
        sentAt: new Date().toISOString(),
      };

      if (previous) {
        qc.setQueryData<ThreadMessagesResponse>(queryKey, {
          ...previous,
          messages: [...previous.messages, optimistic],
        });
      }

      return { previous };
    },

    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) {
        qc.setQueryData(queryKey, ctx.previous);
      }
    },

    onSettled: () => {
      qc.invalidateQueries({ queryKey });
      qc.invalidateQueries({ queryKey: KEYS.unread(surface) });
      qc.invalidateQueries({ queryKey: KEYS.allThreads(surface) });
      qc.invalidateQueries({ queryKey: KEYS.contacts(surface) });
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
    ...LIVE_QUERY_OPTIONS,
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
    ...LIVE_QUERY_OPTIONS,
  });
}
