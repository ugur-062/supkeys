"use client";

import { companyApi } from "@/lib/company-auth/api";
import {
  useMutation,
  useQuery,
  useQueryClient,
} from "@tanstack/react-query";

/** Portal — satınalma (ben alıcı) ve satış (ben satıcı) gelen kutuları ayrı. */
export type MessagePortal = "satinalma" | "satis";

export interface ThreadSummary {
  threadId: string;
  otherPartyId: string;
  otherPartyName: string;
  lastMessagePreview: string | null;
  lastMessageAt: string | null;
  unread: boolean;
}

export interface ChatMessage {
  id: string;
  body: string;
  senderName: string;
  mine: boolean;
  createdAt: string;
}

export interface ThreadResponse {
  thread: { id: string; lastMessageAt: string | null } | null;
  otherParty: { id: string; name: string };
  messages: ChatMessage[];
}

const POLLING_MS = 5_000;
const LIVE = {
  refetchInterval: POLLING_MS,
  refetchOnWindowFocus: true,
  refetchOnReconnect: true,
  staleTime: 0,
};

const KEYS = {
  threads: (portal: MessagePortal) => ["company-msg-threads", portal] as const,
  thread: (portal: MessagePortal, otherId: string) =>
    ["company-msg-thread", portal, otherId] as const,
  unread: ["company-msg-unread"] as const,
};

export function useThreads(portal: MessagePortal) {
  return useQuery<ThreadSummary[]>({
    queryKey: KEYS.threads(portal),
    queryFn: async () => {
      const { data } = await companyApi.get<ThreadSummary[]>(
        "/company/messages/threads",
        { params: { portal } },
      );
      return data;
    },
    ...LIVE,
  });
}

export function useThreadMessages(
  portal: MessagePortal,
  otherPartyId: string | undefined,
) {
  return useQuery<ThreadResponse>({
    queryKey: KEYS.thread(portal, otherPartyId ?? ""),
    queryFn: async () => {
      const { data } = await companyApi.get<ThreadResponse>(
        `/company/messages/with/${otherPartyId}`,
        { params: { portal } },
      );
      return data;
    },
    enabled: !!otherPartyId,
    ...LIVE,
  });
}

export function useSendMessage(portal: MessagePortal, otherPartyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (body: string) => {
      const { data } = await companyApi.post<ChatMessage>(
        `/company/messages/with/${otherPartyId}`,
        { body },
        { params: { portal } },
      );
      return data;
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: KEYS.thread(portal, otherPartyId) });
      qc.invalidateQueries({ queryKey: KEYS.threads(portal) });
      qc.invalidateQueries({ queryKey: KEYS.unread });
    },
  });
}

export function useUnreadMessages() {
  return useQuery<{ count: number }>({
    queryKey: KEYS.unread,
    queryFn: async () => {
      const { data } = await companyApi.get<{ count: number }>(
        "/company/messages/unread-count",
      );
      return data;
    },
    refetchInterval: 15_000,
    refetchOnWindowFocus: true,
  });
}
