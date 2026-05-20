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
 * V2-4.2 — Unified mesajlaşma hook'ları.
 *
 * Bir tenant ↔ supplier çifti için TEK thread; mesaj seviyesinde context
 * tag'i (TENDER/ORDER/DIRECT). Tüm route'lar artık otherPartyId üzerinden:
 *   tenant   → /tenants/me/suppliers/:supplierId/messages
 *   supplier → /supplier/tenants/:tenantId/messages
 *
 * Polling 5s + staleTime 0 + window focus refetch.
 */

const POLLING_MS = 5_000;

function clientFor(surface: MessageSurface): AxiosInstance {
  return surface === "tenant" ? api : supplierApi;
}

function messagesPath(surface: MessageSurface, otherPartyId: string): string {
  return surface === "tenant"
    ? `/tenants/me/suppliers/${otherPartyId}/messages`
    : `/supplier/tenants/${otherPartyId}/messages`;
}

const KEYS = {
  thread: (surface: MessageSurface, otherPartyId: string) =>
    ["messages", surface, otherPartyId] as const,
  tenderThreads: (tenantTenderId: string) =>
    ["tender-threads", tenantTenderId] as const,
  allThreads: (surface: MessageSurface) =>
    ["messages-all-threads", surface] as const,
  contacts: (surface: MessageSurface) =>
    ["messages-contacts", surface] as const,
  unread: (surface: MessageSurface) =>
    ["messages-unread", surface] as const,
};

const LIVE_QUERY_OPTIONS = {
  refetchInterval: POLLING_MS,
  refetchIntervalInBackground: false,
  refetchOnWindowFocus: true,
  refetchOnMount: "always" as const,
  refetchOnReconnect: true,
  staleTime: 0,
};

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
  otherPartyId: string | undefined,
) {
  return useQuery<ThreadMessagesResponse>({
    queryKey: KEYS.thread(surface, otherPartyId ?? ""),
    queryFn: async () => {
      const { data } = await clientFor(surface).get<ThreadMessagesResponse>(
        messagesPath(surface, otherPartyId!),
      );
      return data;
    },
    enabled: !!otherPartyId,
    ...LIVE_QUERY_OPTIONS,
  });
}

export function useSendMessage(
  surface: MessageSurface,
  otherPartyId: string,
  /** Bu thread'e gönderilen mesajların auto context'i (tender/order detay
   * butonundan açılan dialog için). DIRECT pass etmeye gerek yok. */
  defaultContext?: { context: MessageContext; contextRefId?: string },
) {
  const qc = useQueryClient();
  const queryKey = KEYS.thread(surface, otherPartyId);
  const senderType = surface === "tenant" ? "TENANT_USER" : "SUPPLIER_USER";

  return useMutation({
    mutationFn: async (payload: SendMessagePayload) => {
      const body: SendMessagePayload = {
        content: payload.content,
        attachmentIds: payload.attachmentIds,
        context: payload.context ?? defaultContext?.context,
        contextRefId: payload.contextRefId ?? defaultContext?.contextRefId,
      };
      const { data } = await clientFor(surface).post(
        messagesPath(surface, otherPartyId),
        body,
      );
      return data;
    },

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
        context: payload.context ?? defaultContext?.context ?? null,
        contextRefId:
          payload.contextRefId ?? defaultContext?.contextRefId ?? null,
        contextLabel: null,
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
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
