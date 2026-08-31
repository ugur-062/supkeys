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

// Dalga B-4: `useInbox` KALDIRILDI — hiçbir yerden çağrılmıyordu
// (ölü kod). Gerekirse git geçmişinden geri alınabilir.
