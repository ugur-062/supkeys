"use client";

import { api } from "@/lib/api";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";

// ── İlanlar ──────────────────────────────────────────────────

export interface AdminListingRow {
  id: string;
  number: string | null;
  title: string;
  type: "ALIM" | "SATIS";
  format: string | null;
  status: string;
  visibility: string;
  closesAt: string | null;
  primaryCurrency: string;
  bidCount: number;
  invitationCount: number;
  createdAt: string;
}

export function useAdminCompanyListings(companyId: string) {
  return useQuery({
    queryKey: ["admin-company-listings", companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminListingRow[]>(
        `/admin/companies/${companyId}/listings`,
      );
      return data;
    },
  });
}

export interface AdminListingDetail {
  id: string;
  number: string | null;
  title: string;
  description: string | null;
  type: "ALIM" | "SATIS";
  format: string | null;
  status: string;
  visibility: string;
  closesAt: string | null;
  cancelReason: string | null;
  primaryCurrency: string;
  isSealedBid: boolean;
  awardedAt: string | null;
  createdAt: string;
  company: { id: string; name: string; rothernId: string | null };
  items: {
    id: string;
    lineNo: number;
    name: string;
    quantity: string;
    unit: string;
    minUnitPrice: string | null;
    buyNowUnitPrice: string | null;
  }[];
  invitations: {
    id: string;
    createdAt: string;
    invitedCompany: { id: string; name: string; rothernId: string | null };
  }[];
  bids: {
    id: string;
    amount: string;
    currency: string;
    status: string;
    version: number;
    round: number;
    isBuyNow: boolean;
    submittedAt: string | null;
    deliveryDate: string | null;
    eliminationReason: string | null;
    eliminatedAt: string | null;
    createdAt: string;
    bidderCompany: { id: string; name: string; rothernId: string | null };
  }[];
  orders: {
    id: string;
    number: string | null;
    status: string;
    amount: string;
    currency: string;
  }[];
}

export function useAdminListingDetail(id: string) {
  return useQuery({
    queryKey: ["admin-listing-detail", id],
    queryFn: async () => {
      const { data } = await api.get<AdminListingDetail>(
        `/admin/listings/${id}`,
      );
      return data;
    },
  });
}

/** İlan müdahaleleri: kapat (gerekçeli) / uzat / yeniden aç. */
export function useListingIntervention(listingId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async (
      input:
        | { action: "close"; reason: string }
        | { action: "extend"; closesAt: string }
        | { action: "reopen"; closesAt: string },
    ) => {
      const { action, ...body } = input;
      await api.post(`/admin/listings/${listingId}/${action}`, body);
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-listing-detail", listingId] });
      qc.invalidateQueries({ queryKey: ["admin-company-listings"] });
    },
  });
}

// ── Siparişler ───────────────────────────────────────────────

export interface AdminOrderRow {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  createdAt: string;
  role: "buyer" | "seller";
  buyerName: string;
  sellerName: string;
}

export function useAdminCompanyOrders(companyId: string) {
  return useQuery({
    queryKey: ["admin-company-orders", companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminOrderRow[]>(
        `/admin/companies/${companyId}/orders`,
      );
      return data;
    },
  });
}

export interface AdminOrderDetail {
  id: string;
  number: string | null;
  status: string;
  amount: number;
  currency: string;
  paymentTiming: string;
  cancelReason: string | null;
  rejectedReason: string | null;
  acceptedAt: string | null;
  expectedDeliveryDate: string | null;
  invoiceNumber: string | null;
  deliveryStartedAt: string | null;
  deliveredAt: string | null;
  completedAt: string | null;
  cancelledAt: string | null;
  createdAt: string;
  buyer: { id: string; name: string; rothernId: string | null };
  seller: { id: string; name: string; rothernId: string | null };
  listing: { id: string; title: string; number: string | null } | null;
  items: {
    id: string;
    name: string;
    quantity: number;
    unit: string;
    unitPrice: number;
  }[];
  payments: {
    id: string;
    amount: number;
    method: string | null;
    status: string;
    rejectReason: string | null;
    confirmedAt: string | null;
    createdAt: string;
  }[];
  documents: {
    id: string;
    type: string;
    fileName: string;
    createdAt: string;
  }[];
}

export function useAdminOrderDetail(id: string) {
  return useQuery({
    queryKey: ["admin-order-detail", id],
    queryFn: async () => {
      const { data } = await api.get<AdminOrderDetail>(`/admin/orders/${id}`);
      return data;
    },
  });
}

export function useCancelOrder(orderId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({ reason }: { reason: string }) => {
      await api.post(`/admin/orders/${orderId}/cancel`, { reason });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["admin-order-detail", orderId] });
      qc.invalidateQueries({ queryKey: ["admin-company-orders"] });
    },
  });
}

// ── Bağlantılar ──────────────────────────────────────────────

export interface AdminConnectionsView {
  connections: {
    id: string;
    status: string;
    origin: string;
    createdAt: string;
    decidedAt: string | null;
    direction: "outgoing" | "incoming";
    other: { id: string; name: string; rothernId: string | null };
  }[];
  referralInvites: {
    id: string;
    email: string;
    status: string;
    createdAt: string;
  }[];
}

export function useAdminCompanyConnections(companyId: string) {
  return useQuery({
    queryKey: ["admin-company-connections", companyId],
    queryFn: async () => {
      const { data } = await api.get<AdminConnectionsView>(
        `/admin/companies/${companyId}/connections`,
      );
      return data;
    },
  });
}

export function useRevokeInvite(companyId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async ({
      kind,
      id,
    }: {
      kind: "connection" | "referral";
      id: string;
    }) => {
      await api.delete(
        kind === "connection"
          ? `/admin/connections/${id}`
          : `/admin/referral-invites/${id}`,
      );
    },
    onSuccess: () =>
      qc.invalidateQueries({
        queryKey: ["admin-company-connections", companyId],
      }),
  });
}
