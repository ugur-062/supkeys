"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useQuery } from "@tanstack/react-query";

export interface CompanyOrder {
  id: string;
  number: string | null;
  amount: string;
  status: "CREATED" | "IN_DELIVERY" | "DELIVERED" | "COMPLETED" | "CANCELLED";
  role: "seller" | "buyer";
  counterparty: string;
  listingTitle: string | null;
  listingNumber: string | null;
  createdAt: string;
}

export function useOrders() {
  return useQuery({
    queryKey: ["company-orders", "list"],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrder[]>("/company/orders");
      return data;
    },
  });
}
