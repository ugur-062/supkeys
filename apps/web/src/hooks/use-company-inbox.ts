"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export interface InboxItem {
  kind: "connection" | "bids" | "order_ship" | "order_receive" | "order_pay";
  emoji: string;
  title: string;
  actionLabel: string;
  href: string;
}

export function useInbox() {
  return useQuery({
    queryKey: ["company-inbox"],
    queryFn: async () => {
      const { data } = await companyApi.get<InboxItem[]>("/company/inbox");
      return data;
    },
  });
}
