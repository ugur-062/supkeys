"use client";

import { companyApi } from "@/lib/company-auth/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

export interface CompanyOrderItemRow {
  id: string;
  name: string;
  quantity: string;
  unit: string;
  unitPrice: string;
}

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
  items?: CompanyOrderItemRow[];
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

export function useOrder(id: string) {
  return useQuery({
    queryKey: ["company-orders", "detail", id],
    queryFn: async () => {
      const { data } = await companyApi.get<CompanyOrder>(
        `/company/orders/${id}`,
      );
      return data;
    },
  });
}

export function useOrderAction(id: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (action: "ship" | "receive" | "complete") => {
      const { data } = await companyApi.post(`/company/orders/${id}/${action}`);
      return data;
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["company-orders"] }),
  });
}
