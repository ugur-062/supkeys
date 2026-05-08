"use client";

import { api } from "@/lib/api";
import type { AuthResponse } from "@/lib/auth/types";
import type {
  AcceptInvitationPayload,
  PublicInvitationInfo,
} from "@/lib/users/types";
import { useMutation, useQuery } from "@tanstack/react-query";

/**
 * Public invitation lookup — token üzerinden davet bilgisi alır.
 * 401 / 404 / 409 dönüşlerinde retry yapma (geçersiz davet).
 */
export function useInvitation(token: string | null | undefined) {
  return useQuery({
    queryKey: ["invitation", token],
    queryFn: async () => {
      const { data } = await api.get<PublicInvitationInfo>(
        `/invitations/${token}`,
      );
      return data;
    },
    enabled: Boolean(token),
    retry: false,
    staleTime: 0,
  });
}

export function useAcceptInvitation() {
  return useMutation({
    mutationFn: async (input: {
      token: string;
      payload: AcceptInvitationPayload;
    }) => {
      const { data } = await api.post<AuthResponse>(
        `/invitations/${input.token}/accept`,
        input.payload,
      );
      return data;
    },
  });
}
