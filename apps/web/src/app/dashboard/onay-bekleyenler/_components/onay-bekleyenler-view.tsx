"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { useApprovalRequests } from "@/hooks/use-approval-requests";
import { useTenantUsers } from "@/hooks/use-tenant-users";
import {
  APPROVAL_REQUEST_STATUS_META,
  APPROVAL_TYPE_LABEL,
  formatAmountTR,
} from "@/lib/approval-requests/labels";
import type {
  ApprovalFlowType,
  ApprovalRequestListItem,
  ApprovalRequestStatus,
  ListApprovalRequestsParams,
} from "@/lib/approval-requests/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ClipboardCheck, RefreshCw, Search } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ApprovalStatusBadge,
  ApprovalTypeBadge,
} from "./status-badge";

type TabKey = "pending" | "all";

const VALID_TABS: TabKey[] = ["pending", "all"];

const STATUS_OPTIONS: Array<{ value: ApprovalRequestStatus | ""; label: string }> = [
  { value: "", label: "Tüm Statüler" },
  { value: "PENDING", label: "Bekliyor" },
  { value: "APPROVED", label: "Onaylandı" },
  { value: "REJECTED", label: "Reddedildi" },
  { value: "CANCELLED", label: "İptal Edildi" },
];

const TYPE_OPTIONS: Array<{ value: ApprovalFlowType | ""; label: string }> = [
  { value: "", label: "Tüm Türler" },
  { value: "TENDER_PUBLISH", label: "İhale Onayı" },
  { value: "TENDER_AWARD", label: "Kazanan Onayı" },
];

function parseTab(value: string | null): TabKey {
  if (value && (VALID_TABS as string[]).includes(value)) return value as TabKey;
  return "pending";
}

const SELECT_CLASS = cn(
  "w-full px-3.5 py-2.5 rounded-lg border bg-white text-sm",
  "text-brand-900 focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500",
  "border-surface-border",
);

export function OnayBekleyenlerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));

  const [statusFilter, setStatusFilter] = useState<ApprovalRequestStatus | "">(
    "",
  );
  const [typeFilter, setTypeFilter] = useState<ApprovalFlowType | "">("");
  const [initiatorFilter, setInitiatorFilter] = useState("");
  const [tenderNumber, setTenderNumber] = useState("");
  const [approvalNumber, setApprovalNumber] = useState("");

  const { data: users } = useTenantUsers();

  const filters: ListApprovalRequestsParams = useMemo(() => {
    if (activeTab === "pending") {
      return { pendingForMe: true };
    }
    return {
      ...(statusFilter && { status: statusFilter }),
      ...(typeFilter && { type: typeFilter }),
      ...(initiatorFilter && { initiatorUserId: initiatorFilter }),
      ...(tenderNumber.trim() && { tenderNumber: tenderNumber.trim() }),
      ...(approvalNumber.trim() && { approvalNumber: approvalNumber.trim() }),
    };
  }, [
    activeTab,
    statusFilter,
    typeFilter,
    initiatorFilter,
    tenderNumber,
    approvalNumber,
  ]);

  const { data: requests, isLoading, refetch, isFetching } =
    useApprovalRequests(filters);

  const setTab = useCallback(
    (tab: TabKey) => {
      const params = new URLSearchParams(searchParams);
      params.set("tab", tab);
      router.push(`/dashboard/onay-bekleyenler?${params.toString()}`);
    },
    [router, searchParams],
  );

  const clearFilters = useCallback(() => {
    setStatusFilter("");
    setTypeFilter("");
    setInitiatorFilter("");
    setTenderNumber("");
    setApprovalNumber("");
  }, []);

  // Tab değişince filtreleri sıfırla (pending tab'da kullanılmıyor)
  useEffect(() => {
    if (activeTab === "pending") {
      clearFilters();
    }
  }, [activeTab, clearFilters]);

  return (
    <div className="max-w-7xl mx-auto px-4 sm:px-6 py-8">
      <Link
        href="/dashboard"
        className="text-sm text-slate-500 hover:text-brand-600 inline-flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Ana Sayfa
      </Link>

      <div className="mb-6">
        <h1 className="text-2xl sm:text-3xl font-display font-bold text-brand-900">
          Onay Süreçleri
        </h1>
        <p className="text-slate-500 mt-1 text-sm">
          Onayda bekleyen süreçleriniz için işlem gerçekleştirebilir, geçmiş tüm
          onay süreçlerinizi görüntüleyebilirsiniz.
        </p>
      </div>

      <div className="bg-white border border-surface-border rounded-2xl shadow-sm">
        {/* Tab'lar */}
        <div className="flex border-b border-surface-border px-4 sm:px-6">
          <TabButton
            active={activeTab === "pending"}
            onClick={() => setTab("pending")}
          >
            Onay Bekleyenler
          </TabButton>
          <TabButton active={activeTab === "all"} onClick={() => setTab("all")}>
            Tüm Onay Süreçleri
          </TabButton>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto text-sm text-slate-500 hover:text-brand-600 inline-flex items-center gap-1.5 px-2"
            title="Yenile"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
            />
          </button>
        </div>

        {/* Filtreler — sadece "Tüm" tab'ında */}
        {activeTab === "all" ? (
          <div className="px-4 sm:px-6 py-4 border-b border-surface-border bg-surface-subtle/40">
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3">
              <select
                className={SELECT_CLASS}
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(
                    e.target.value as ApprovalRequestStatus | "",
                  )
                }
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <select
                className={SELECT_CLASS}
                value={initiatorFilter}
                onChange={(e) => setInitiatorFilter(e.target.value)}
              >
                <option value="">Tüm Başlatanlar</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </select>

              <select
                className={SELECT_CLASS}
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as ApprovalFlowType | "")
                }
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>

              <Input
                placeholder="İhale No"
                value={tenderNumber}
                onChange={(e) => setTenderNumber(e.target.value)}
              />

              <Input
                placeholder="Onay No"
                value={approvalNumber}
                onChange={(e) => setApprovalNumber(e.target.value)}
              />
            </div>

            <div className="mt-3 flex items-center justify-between">
              <p className="text-xs text-slate-500">
                {requests
                  ? `${requests.length} kayıt bulundu`
                  : "Yükleniyor…"}
              </p>
              <button
                type="button"
                onClick={clearFilters}
                className="text-xs text-brand-600 hover:underline"
              >
                Filtreleri Temizle
              </button>
            </div>
          </div>
        ) : null}

        {/* Tablo */}
        {isLoading ? (
          <div className="p-12 text-center text-slate-500 text-sm">
            Yükleniyor…
          </div>
        ) : !requests || requests.length === 0 ? (
          <EmptyState tab={activeTab} />
        ) : (
          <ApprovalRequestsTable
            requests={requests}
            activeTab={activeTab}
          />
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "px-4 py-3 text-sm font-medium border-b-2 -mb-px transition-colors",
        active
          ? "border-brand-600 text-brand-700 bg-brand-50/30"
          : "border-transparent text-slate-500 hover:text-brand-600 hover:bg-slate-50",
      )}
    >
      {children}
    </button>
  );
}

function EmptyState({ tab }: { tab: TabKey }) {
  return (
    <div className="p-12 text-center">
      <div className="h-14 w-14 mx-auto bg-slate-100 rounded-2xl flex items-center justify-center mb-4">
        <ClipboardCheck className="h-7 w-7 text-slate-400" />
      </div>
      <p className="text-slate-700 font-medium">
        {tab === "pending"
          ? "Onay bekleyen süreciniz yok"
          : "Onay süreci bulunamadı"}
      </p>
      <p className="text-slate-500 text-sm mt-1">
        {tab === "pending"
          ? "Sizden onay beklenen aktif bir süreç bulunmuyor."
          : "Filtrelere uyan kayıt yok. Filtreleri sıfırlayıp tekrar deneyin."}
      </p>
    </div>
  );
}

function ApprovalRequestsTable({
  requests,
  activeTab,
}: {
  requests: ApprovalRequestListItem[];
  activeTab: TabKey;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full">
        <thead>
          <tr className="text-xs uppercase tracking-wide text-slate-500 border-b border-surface-border">
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              Onay No
            </th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              Onay Türü
            </th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              İhale
            </th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              Başlatan
            </th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              {activeTab === "pending" ? "Adım" : "Statü"}
            </th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">Tutar</th>
            <th className="text-left px-4 sm:px-6 py-3 font-medium">
              Son İşlem
            </th>
            <th className="px-4 sm:px-6 py-3 w-12"></th>
          </tr>
        </thead>
        <tbody className="divide-y divide-surface-border">
          {requests.map((req) => (
            <ApprovalRequestRow
              key={req.id}
              request={req}
              activeTab={activeTab}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

function ApprovalRequestRow({
  request,
  activeTab,
}: {
  request: ApprovalRequestListItem;
  activeTab: TabKey;
}) {
  const totalActiveSteps = request.steps.filter(
    (s) => s.status !== "SKIPPED",
  ).length;
  const decidedSteps = request.steps.filter(
    (s) => s.status === "APPROVED" || s.status === "REJECTED",
  ).length;

  return (
    <tr className="hover:bg-slate-50/60 transition-colors">
      <td className="px-4 sm:px-6 py-4">
        <Link
          href={`/dashboard/onay-bekleyenler/${request.id}`}
          className="font-mono text-sm font-semibold text-brand-700 hover:underline"
        >
          {request.approvalNumber}
        </Link>
      </td>
      <td className="px-4 sm:px-6 py-4">
        <ApprovalTypeBadge type={request.type} />
      </td>
      <td className="px-4 sm:px-6 py-4">
        <p className="font-mono text-xs text-slate-500">
          {request.tender.tenderNumber}
        </p>
        <p className="text-sm text-brand-900 line-clamp-1 max-w-[260px]">
          {request.tender.title}
        </p>
      </td>
      <td className="px-4 sm:px-6 py-4 text-sm text-slate-700">
        {request.initiatedBy.firstName} {request.initiatedBy.lastName}
      </td>
      <td className="px-4 sm:px-6 py-4">
        {activeTab === "pending" ? (
          <span className="font-mono text-sm text-slate-700">
            {decidedSteps}/{totalActiveSteps}
          </span>
        ) : (
          <ApprovalStatusBadge status={request.status} />
        )}
      </td>
      <td className="px-4 sm:px-6 py-4 text-sm font-medium text-brand-900 whitespace-nowrap">
        {formatAmountTR(request.amount, request.currency)}
      </td>
      <td className="px-4 sm:px-6 py-4 text-sm text-slate-500 whitespace-nowrap">
        {format(new Date(request.updatedAt), "dd MMM yyyy HH:mm", {
          locale: tr,
        })}
      </td>
      <td className="px-4 sm:px-6 py-4 text-right">
        <Link href={`/dashboard/onay-bekleyenler/${request.id}`}>
          <Button variant="ghost" size="sm">
            Görüntüle →
          </Button>
        </Link>
      </td>
    </tr>
  );
}
