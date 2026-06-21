"use client";

import { Select } from "@/components/catalyst/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import {
  EmptyState as EmptyStateComponent,
  ListSkeleton,
  PageHeader,
  Pagination,
  ResultCount,
  SearchInput,
} from "@/components/list";
import { Button } from "@/components/ui/button";
import { useApprovalRequests } from "@/hooks/use-approval-requests";
import { useTenantUsers } from "@/hooks/use-tenant-users";
import { formatAmountTR } from "@/lib/approval-requests/labels";
import type {
  ApprovalFlowType,
  ApprovalRequestListItem,
  ApprovalRequestStatus,
  ListApprovalRequestsParams,
} from "@/lib/approval-requests/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ChevronLeft, ClipboardCheck, RefreshCw } from "lucide-react";
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
  { value: "TENDER_AWARD", label: "Kazanan Onayı" },
];

function parseTab(value: string | null): TabKey {
  if (value && (VALID_TABS as string[]).includes(value)) return value as TabKey;
  return "pending";
}

const PAGE_SIZE = 20;

export function OnayBekleyenlerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const activeTab = parseTab(searchParams.get("tab"));

  const [statusFilter, setStatusFilter] = useState<ApprovalRequestStatus | "">(
    "",
  );
  const [typeFilter, setTypeFilter] = useState<ApprovalFlowType | "">("");
  const [initiatorFilter, setInitiatorFilter] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { data: users } = useTenantUsers();

  const filters: ListApprovalRequestsParams = useMemo(() => {
    const base: ListApprovalRequestsParams =
      activeTab === "pending"
        ? { pendingForMe: true }
        : {
            ...(statusFilter && { status: statusFilter }),
            ...(typeFilter && { type: typeFilter }),
            ...(initiatorFilter && { initiatorUserId: initiatorFilter }),
            ...(search.trim() && { search: search.trim() }),
          };
    return { ...base, page, pageSize: PAGE_SIZE };
  }, [activeTab, statusFilter, typeFilter, initiatorFilter, search, page]);

  // Filtre/sekme değişince sayfa 1'e dön (aksi halde boş sayfada kalınabilir)
  useEffect(() => {
    setPage(1);
  }, [activeTab, statusFilter, typeFilter, initiatorFilter, search]);

  const activeFilterCount =
    activeTab === "all"
      ? (statusFilter ? 1 : 0) +
        (typeFilter ? 1 : 0) +
        (initiatorFilter ? 1 : 0) +
        (search.trim() ? 1 : 0)
      : 0;

  const { data, isLoading, refetch, isFetching } =
    useApprovalRequests(filters);
  const requests = data?.items ?? [];
  const total = data?.pagination.total ?? 0;

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
    setSearch("");
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
        className="text-sm text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1 mb-4"
      >
        <ChevronLeft className="h-4 w-4" />
        Ana Sayfa
      </Link>

      <PageHeader
        className="mb-6"
        title="Onay Süreçleri"
        description="“Sıra Sizde” yalnızca şu an sizin onayınızı bekleyen süreçleri gösterir. “Tüm Süreçler” ise (başkalarının onayını bekleyenler dahil) firmanızdaki bütün onayları listeler."
      />

      <div className="bg-white ring-1 ring-zinc-950/5 rounded-2xl shadow-sm">
        {/* Tab'lar */}
        <div className="flex border-b border-zinc-950/5 px-4 sm:px-6">
          <TabButton
            active={activeTab === "pending"}
            onClick={() => setTab("pending")}
          >
            Sıra Sizde
          </TabButton>
          <TabButton active={activeTab === "all"} onClick={() => setTab("all")}>
            Tüm Süreçler
          </TabButton>
          <button
            type="button"
            onClick={() => refetch()}
            disabled={isFetching}
            className="ml-auto text-sm text-zinc-500 hover:text-zinc-900 inline-flex items-center gap-1.5 px-2"
            title="Yenile"
          >
            <RefreshCw
              className={cn("h-4 w-4", isFetching && "animate-spin")}
            />
          </button>
        </div>

        {/* Filtreler — sadece "Tüm" tab'ında */}
        {activeTab === "all" ? (
          <div className="px-4 sm:px-6 py-4 border-b border-zinc-950/5 bg-zinc-50/40 space-y-3">
            <SearchInput
              value={search}
              onChange={setSearch}
              placeholder="Onay no, ihale no veya başlık ara…"
              className="w-full md:w-96"
            />

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <Select
                value={statusFilter}
                onChange={(e) =>
                  setStatusFilter(e.target.value as ApprovalRequestStatus | "")
                }
                aria-label="Statü filtresi"
              >
                {STATUS_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>

              <Select
                value={initiatorFilter}
                onChange={(e) => setInitiatorFilter(e.target.value)}
                aria-label="Kişi filtresi"
              >
                <option value="">Tüm Kişiler</option>
                {users?.map((u) => (
                  <option key={u.id} value={u.id}>
                    {u.firstName} {u.lastName}
                  </option>
                ))}
              </Select>

              <Select
                value={typeFilter}
                onChange={(e) =>
                  setTypeFilter(e.target.value as ApprovalFlowType | "")
                }
                aria-label="Tür filtresi"
              >
                {TYPE_OPTIONS.map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </Select>
            </div>

            <div className="flex items-center justify-between">
              <ResultCount
                total={total}
                isFiltered={activeFilterCount > 0}
                unit="kayıt"
              />
              {activeFilterCount > 0 ? (
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-xs text-zinc-900 hover:underline font-semibold"
                >
                  Filtreleri Temizle ({activeFilterCount})
                </button>
              ) : null}
            </div>
          </div>
        ) : null}

        {/* Tablo */}
        {isLoading ? (
          <ListSkeleton rows={5} />
        ) : requests.length === 0 ? (
          activeFilterCount > 0 ? (
            <EmptyStateComponent
              icon={ClipboardCheck}
              variant="no-results"
              title="Filtre eşleşmedi"
              description="Aramanız veya seçilen filtreler ile eşleşen onay süreci yok."
              action={
                <button
                  type="button"
                  onClick={clearFilters}
                  className="text-sm text-zinc-900 hover:underline font-semibold"
                >
                  Filtreleri temizle
                </button>
              }
            />
          ) : (
            <EmptyStateComponent
              icon={ClipboardCheck}
              variant="no-data"
              title={
                activeTab === "pending"
                  ? "Onay bekleyen süreciniz yok"
                  : "Onay süreci yok"
              }
              description={
                activeTab === "pending"
                  ? "Sizden onay beklenen aktif bir süreç bulunmuyor."
                  : "Bu firmaya henüz hiç onay süreci açılmamış."
              }
            />
          )
        ) : (
          <>
            <ApprovalRequestsTable requests={requests} activeTab={activeTab} />
            {data && data.pagination.totalPages > 1 ? (
              <Pagination
                page={data.pagination.page}
                totalPages={data.pagination.totalPages}
                total={data.pagination.total}
                pageSize={data.pagination.pageSize}
                onPageChange={setPage}
              />
            ) : null}
          </>
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
          ? "border-zinc-900 text-zinc-900"
          : "border-transparent text-zinc-500 hover:text-zinc-700",
      )}
    >
      {children}
    </button>
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
    <div className="px-2 sm:px-4 [--gutter:--spacing(4)]">
      <Table dense>
        <TableHead>
          <TableRow>
            <TableHeader>Onay No</TableHeader>
            <TableHeader>Onay Türü</TableHeader>
            <TableHeader>İhale</TableHeader>
            <TableHeader>İşlemi Yapan</TableHeader>
            <TableHeader>{activeTab === "pending" ? "Adım" : "Statü"}</TableHeader>
            <TableHeader>Tutar</TableHeader>
            <TableHeader>Son İşlem</TableHeader>
            <TableHeader className="w-12" />
          </TableRow>
        </TableHead>
        <TableBody>
          {requests.map((req) => (
            <ApprovalRequestRow
              key={req.id}
              request={req}
              activeTab={activeTab}
            />
          ))}
        </TableBody>
      </Table>
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
  // Sıra kimde — şu an PENDING olan adımın onaylayanı (netlik: madde 23/24/25)
  const currentStep = request.steps.find((s) => s.status === "PENDING");

  return (
    <TableRow>
      <TableCell>
        <Link
          href={`/dashboard/onay-bekleyenler/${request.id}`}
          className="font-mono text-sm font-semibold text-zinc-900 hover:underline"
        >
          {request.approvalNumber}
        </Link>
      </TableCell>
      <TableCell>
        <ApprovalTypeBadge type={request.type} />
      </TableCell>
      <TableCell>
        <p className="font-mono text-xs text-zinc-500">
          {request.tender.tenderNumber}
        </p>
        <p className="text-sm text-zinc-900 line-clamp-1 max-w-[260px]">
          {request.tender.title}
        </p>
      </TableCell>
      <TableCell className="text-sm text-zinc-700">
        {request.initiatedBy.firstName} {request.initiatedBy.lastName}
      </TableCell>
      <TableCell>
        {activeTab === "pending" ? (
          <span className="font-mono text-sm text-zinc-700">
            {decidedSteps}/{totalActiveSteps}
          </span>
        ) : (
          <div className="space-y-0.5">
            <ApprovalStatusBadge status={request.status} />
            {request.status === "PENDING" && currentStep ? (
              <p className="text-[11px] text-zinc-500 whitespace-nowrap">
                Şu an: {currentStep.approver.firstName}{" "}
                {currentStep.approver.lastName}
              </p>
            ) : null}
          </div>
        )}
      </TableCell>
      <TableCell className="text-sm font-medium text-zinc-900 whitespace-nowrap">
        {formatAmountTR(request.amount, request.currency)}
      </TableCell>
      <TableCell className="text-sm text-zinc-500 whitespace-nowrap">
        {format(new Date(request.updatedAt), "dd MMM yyyy HH:mm", {
          locale: tr,
        })}
      </TableCell>
      <TableCell className="text-right">
        <Link href={`/dashboard/onay-bekleyenler/${request.id}`}>
          <Button variant="ghost" size="sm">
            Görüntüle →
          </Button>
        </Link>
      </TableCell>
    </TableRow>
  );
}
