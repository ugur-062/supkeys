"use client";

import {
  useCancelInvitation,
  useInvitations,
  useResendInvitation,
} from "@/hooks/use-supplier-invitations";
import {
  useSupplierStats,
  useSuppliers,
  useUnblockSupplier,
} from "@/hooks/use-tenant-suppliers";
import { useAuthStore } from "@/lib/auth/store";
import {
  INVITATION_STATUS_META,
  INVITATION_STATUS_ORDER,
} from "@/lib/tedarikciler/status";
import type {
  InvitationItem,
  InvitationStatus,
} from "@/lib/tedarikciler/types";
import axios from "axios";
import { useRouter, useSearchParams } from "next/navigation";
import { useCallback, useMemo, useState } from "react";
import { toast } from "sonner";
import { ApprovedSuppliersTable } from "./approved-suppliers-table";
import { BlockedSuppliersTable } from "./blocked-suppliers-table";
import { FiltersBar } from "./filters-bar";
import { HeaderCard } from "./header-card";
import { InvitationsTable } from "./invitations-table";
import { InviteSupplierModal } from "./invite-supplier-modal";
import { Pagination } from "./pagination";
import { PendingRelationsTable } from "./pending-relations-table";
import { SupplierDetailDrawer } from "./supplier-detail-drawer";
import { TabsContent, TedarikcilerTabs, type TedarikciTab } from "./tabs";

const VALID_TABS = new Set<string>([
  "approved",
  "invitations",
  "pending",
  "blocked",
]);
const VALID_INVITATION_STATUSES = new Set<string>(INVITATION_STATUS_ORDER);

function parseTab(value: string | null): TedarikciTab {
  if (value && VALID_TABS.has(value)) return value as TedarikciTab;
  return "approved";
}

function parsePage(value: string | null): number {
  const n = value ? parseInt(value, 10) : 1;
  return Number.isFinite(n) && n > 0 ? n : 1;
}

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

const PAGE_SIZE = 20;

export function TedarikcilerView() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const role = useAuthStore((s) => s.user?.role);
  const canManage = role === "COMPANY_ADMIN";

  const tab = parseTab(searchParams.get("tab"));
  const search = searchParams.get("search") ?? "";
  const invitationStatusRaw = searchParams.get("invStatus");
  const invitationStatus =
    invitationStatusRaw && VALID_INVITATION_STATUSES.has(invitationStatusRaw)
      ? (invitationStatusRaw as InvitationStatus)
      : "";
  const page = parsePage(searchParams.get("page"));

  const [selectedRelationId, setSelectedRelationId] = useState<string | null>(
    null,
  );
  const [inviteModalOpen, setInviteModalOpen] = useState(false);
  const [inviteInitial, setInviteInitial] = useState<string[] | undefined>();
  const [busyInvitationId, setBusyInvitationId] = useState<string | null>(
    null,
  );
  const [busyRelationId, setBusyRelationId] = useState<string | null>(null);

  const stats = useSupplierStats();

  // Sekmeye göre liste sorgusu
  const approved = useSuppliers({
    status: "ACTIVE",
    search: tab === "approved" ? search || undefined : undefined,
    page: tab === "approved" ? page : 1,
    pageSize: PAGE_SIZE,
  });
  const blocked = useSuppliers({
    status: "BLOCKED",
    search: tab === "blocked" ? search || undefined : undefined,
    page: tab === "blocked" ? page : 1,
    pageSize: PAGE_SIZE,
  });
  const invitations = useInvitations({
    status: tab === "invitations" ? invitationStatus || undefined : undefined,
    search: tab === "invitations" ? search || undefined : undefined,
    page: tab === "invitations" ? page : 1,
    pageSize: PAGE_SIZE,
  });

  // Davet sayısı: pending + accepted (kullanıcıya görünür akış kayıtları)
  const invitationCount = useMemo(() => {
    if (!invitations.data) return null;
    // Sadece görünür kayıt — backend stats yok, list pagination total
    return invitations.data.pagination.total;
  }, [invitations.data]);

  const updateUrl = useCallback(
    (next: {
      tab?: TedarikciTab;
      search?: string;
      invStatus?: InvitationStatus | "";
      page?: number;
    }) => {
      const params = new URLSearchParams(searchParams.toString());
      const apply = (key: string, value: string | number | undefined) => {
        if (value === undefined) return;
        const str = String(value);
        if (str === "" || (key === "page" && str === "1")) {
          params.delete(key);
        } else {
          params.set(key, str);
        }
      };
      if (next.tab !== undefined) {
        // tab değişince sayfa + arama temizlenir
        if (next.tab === "approved") params.delete("tab");
        else params.set("tab", next.tab);
        params.delete("page");
      }
      if (next.search !== undefined) apply("search", next.search);
      if (next.invStatus !== undefined) apply("invStatus", next.invStatus);
      if (next.page !== undefined) apply("page", next.page);
      const qs = params.toString();
      router.replace(
        qs ? `/dashboard/tedarikciler?${qs}` : "/dashboard/tedarikciler",
      );
    },
    [router, searchParams],
  );

  const handleTabChange = (next: TedarikciTab) => {
    updateUrl({ tab: next, search: "", invStatus: "", page: 1 });
  };

  const handleSearchChange = (value: string) => {
    updateUrl({ search: value, page: 1 });
  };
  const handleInvitationStatusChange = (value: InvitationStatus | "") => {
    updateUrl({ invStatus: value, page: 1 });
  };
  const handleClear = () => {
    updateUrl({ search: "", invStatus: "", page: 1 });
  };
  const handlePageChange = (next: number) => {
    updateUrl({ page: next });
  };

  // Invitation actions
  const resend = useResendInvitation();
  const cancel = useCancelInvitation();

  const handleResend = (id: string) => {
    setBusyInvitationId(id);
    resend.mutate(id, {
      onSuccess: () => {
        toast.success("Davet yeniden gönderildi");
        setBusyInvitationId(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err, "Yeniden gönderilemedi"));
        setBusyInvitationId(null);
      },
    });
  };

  const handleCancel = (id: string) => {
    if (
      !window.confirm("Bu daveti iptal etmek istediğinize emin misiniz?")
    ) {
      return;
    }
    setBusyInvitationId(id);
    cancel.mutate(id, {
      onSuccess: () => {
        toast.success("Davet iptal edildi");
        setBusyInvitationId(null);
      },
      onError: (err) => {
        toast.error(getErrorMessage(err, "İptal edilemedi"));
        setBusyInvitationId(null);
      },
    });
  };

  const handleReinvite = (item: InvitationItem) => {
    setInviteInitial([item.email]);
    setInviteModalOpen(true);
  };

  // Unblock from blocked table
  const dummyUnblock = useUnblockSupplier("");
  // Yukarıdaki hook her render'da aynı id'yi kullansın diye useUnblockSupplier
  // burada kullanılmaz; bunun yerine tablo satırından çağrılan yerel mutation
  // ihtiyacı için bir helper yazılır:
  const handleUnblockInline = (id: string, companyName: string) => {
    if (
      !window.confirm(
        `"${companyName}" engeli kaldırılacak ve tekrar ihalelerinize davet edilebilecek. Devam edilsin mi?`,
      )
    ) {
      return;
    }
    setBusyRelationId(id);
    // Inline çağrı için axios ile direkt API'ye git, hook ID'yi sabitlediği için
    void inlineUnblock(id)
      .then(() => {
        toast.success("Engel kaldırıldı");
        approved.refetch();
        blocked.refetch();
        stats.refetch();
        setBusyRelationId(null);
      })
      .catch((err) => {
        toast.error(getErrorMessage(err, "Engel kaldırılamadı"));
        setBusyRelationId(null);
      });
  };

  // dummyUnblock referansını kullanım dışı tutmak yerine — tip uyumluluğu için
  void dummyUnblock;

  const approvedItems = approved.data?.items ?? [];
  const approvedPagination = approved.data?.pagination;
  const blockedItems = blocked.data?.items ?? [];
  const blockedPagination = blocked.data?.pagination;
  const invitationItems = invitations.data?.items ?? [];
  const invitationsPagination = invitations.data?.pagination;

  return (
    <div className="space-y-6">
      <div className="space-y-1">
        <h1 className="font-display font-bold text-3xl text-brand-900">
          Tedarikçi Yönetimi
        </h1>
        <p className="text-slate-600">
          Onaylı tedarikçileriniz, gönderdiğiniz davetler ve engelli kayıtlar
          tek yerden.
        </p>
      </div>

      <HeaderCard
        canInvite={canManage}
        onInviteClick={() => {
          setInviteInitial(undefined);
          setInviteModalOpen(true);
        }}
      />

      <TedarikcilerTabs
        value={tab}
        onChange={handleTabChange}
        approvedCount={stats.data?.active ?? null}
        invitationsCount={invitationCount}
        pendingCount={stats.data?.pending ?? null}
        blockedCount={stats.data?.blocked ?? null}
      >
        <TabsContent value="approved" className="space-y-4 outline-none">
          <FiltersBar
            search={search}
            status=""
            onSearchChange={handleSearchChange}
            onStatusChange={() => {}}
            onClear={handleClear}
            statusOptions={null}
          />
          <div className="card overflow-hidden">
            <ApprovedSuppliersTable
              items={approvedItems}
              isLoading={approved.isLoading}
              isError={approved.isError}
              pageSize={PAGE_SIZE}
              onRetry={() => approved.refetch()}
              onSelect={setSelectedRelationId}
              onInvite={() => {
                setInviteInitial(undefined);
                setInviteModalOpen(true);
              }}
              canInvite={canManage}
            />
            {approvedPagination && (
              <Pagination
                page={approvedPagination.page}
                totalPages={approvedPagination.totalPages}
                total={approvedPagination.total}
                pageSize={approvedPagination.pageSize}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="invitations" className="space-y-4 outline-none">
          <FiltersBar<InvitationStatus>
            search={search}
            status={invitationStatus}
            onSearchChange={handleSearchChange}
            onStatusChange={handleInvitationStatusChange}
            onClear={handleClear}
            statusOptions={INVITATION_STATUS_ORDER.map((s) => ({
              value: s,
              label: INVITATION_STATUS_META[s].label,
            }))}
            searchPlaceholder="E-posta veya yetkili adı ara…"
          />
          <div className="card overflow-hidden">
            <InvitationsTable
              items={invitationItems}
              isLoading={invitations.isLoading}
              isError={invitations.isError}
              pageSize={PAGE_SIZE}
              canManage={canManage}
              onRetry={() => invitations.refetch()}
              onResend={handleResend}
              onCancel={handleCancel}
              onReinvite={handleReinvite}
              busyId={busyInvitationId}
            />
            {invitationsPagination && (
              <Pagination
                page={invitationsPagination.page}
                totalPages={invitationsPagination.totalPages}
                total={invitationsPagination.total}
                pageSize={invitationsPagination.pageSize}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        </TabsContent>

        <TabsContent value="pending" className="space-y-4 outline-none">
          <PendingRelationsTable canManage={canManage} />
        </TabsContent>

        <TabsContent value="blocked" className="space-y-4 outline-none">
          <FiltersBar
            search={search}
            status=""
            onSearchChange={handleSearchChange}
            onStatusChange={() => {}}
            onClear={handleClear}
            statusOptions={null}
          />
          <div className="card overflow-hidden">
            <BlockedSuppliersTable
              items={blockedItems}
              isLoading={blocked.isLoading}
              isError={blocked.isError}
              pageSize={PAGE_SIZE}
              canManage={canManage}
              onRetry={() => blocked.refetch()}
              onSelect={setSelectedRelationId}
              onUnblock={handleUnblockInline}
              busyId={busyRelationId}
            />
            {blockedPagination && (
              <Pagination
                page={blockedPagination.page}
                totalPages={blockedPagination.totalPages}
                total={blockedPagination.total}
                pageSize={blockedPagination.pageSize}
                onPageChange={handlePageChange}
              />
            )}
          </div>
        </TabsContent>
      </TedarikcilerTabs>

      <SupplierDetailDrawer
        relationId={selectedRelationId}
        onClose={() => setSelectedRelationId(null)}
        canManage={canManage}
      />

      <InviteSupplierModal
        open={inviteModalOpen}
        onClose={() => setInviteModalOpen(false)}
        initialEmails={inviteInitial}
      />
    </div>
  );
}

// ----- inline unblock helper (hook id'sini her satır için ayrı oluşturmamak için) -----
async function inlineUnblock(relationId: string) {
  const { api } = await import("@/lib/api");
  await api.post(`/tenants/me/suppliers/${relationId}/unblock`);
}
