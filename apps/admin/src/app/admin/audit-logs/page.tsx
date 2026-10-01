"use client";

import { AuditLogRow } from "@/components/audit/audit-log-row";
import {
  Table,
  TableBody,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { AdminRoleGate } from "@/components/layout/admin-role-gate";
import {
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
} from "@/components/list";
import { TableStateRow } from "@/components/list/table-state";
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { useListFilters } from "@/hooks/use-list-filters";
import { ACTION_FILTERS } from "@/lib/audit-actions";

interface AuditFilters {
  actorType?: string;
  action?: string;
  search?: string;
  page?: number;
  [key: string]: string | number | boolean | undefined;
}

function AuditView() {
  // Süzgeçler ve sayfa URL'de: yenileyince/geri gelince 3. sayfa korunur
  // (arayüz testi D-228). Süzgeç değişince sayfa 1'e döner (useListFilters).
  const { filters, setFilters } = useListFilters<AuditFilters>();
  const actorType = filters.actorType ?? "";
  const action = filters.action ?? "";
  const search = filters.search ?? "";
  const page = filters.page ?? 1;
  const setPage = (p: number) => setFilters({ page: p > 1 ? p : undefined });

  const query = useAuditLogs({
    actorType: actorType || undefined,
    action: action || undefined,
    search: search.trim() || undefined,
    page,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <PageHeader
        title="Denetim Kaydı"
        description="Sistemdeki tüm hesap ve destek işlemleri (kim, ne, ne zaman)."
      />

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-3">
        <FilterSelect
          ariaLabel="Aktör tipi"
          value={actorType}
          active={!!actorType}
          onChange={(v) => setFilters({ actorType: v })}
          options={[
            { value: "", label: "Tüm aktörler" },
            { value: "company", label: "Firma" },
            { value: "admin", label: "Admin" },
            { value: "system", label: "Sistem" },
          ]}
        />
        <FilterSelect
          ariaLabel="Eylem"
          value={action}
          active={!!action}
          onChange={(v) => setFilters({ action: v })}
          options={[
            { value: "", label: "Tüm eylemler" },
            ...ACTION_FILTERS,
          ]}
        />
        <SearchInput
          value={search}
          onChange={(v) => setFilters({ search: v })}
          placeholder="E-posta, eylem, varlık ID ara..."
        />
      </div>

      {/* Tablo */}
      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Zaman</TableHeader>
              <TableHeader>Aktör</TableHeader>
              <TableHeader>Eylem</TableHeader>
              <TableHeader>Varlık</TableHeader>
              <TableHeader>Detay</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              // Hata dalında "Tekrar dene" düğmesi (arayüz testi D-228).
              <TableStateRow
                colSpan={5}
                loading={query.isLoading}
                error={query.isError}
                onRetry={() => void query.refetch()}
                empty="Kayıt bulunamadı"
              />
            ) : (
              items.map((it) => <AuditLogRow key={it.id} item={it} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sayfalama */}
      {pagination ? (
        <Pagination
          page={pagination.page}
          totalPages={pagination.totalPages}
          total={pagination.total}
          pageSize={pagination.pageSize}
          onPageChange={setPage}
          variant="bare"
        />
      ) : null}
    </div>
  );
}

export default function AuditLogsPage() {
  return (
    <AdminShell>
      <AdminRoleGate action="viewAuditLogs">
        <AuditView />
      </AdminRoleGate>
    </AdminShell>
  );
}
