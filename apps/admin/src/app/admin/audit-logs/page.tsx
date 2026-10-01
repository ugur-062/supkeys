"use client";

import { AuditLogRow } from "@/components/audit/audit-log-row";
import {
  Table,
  TableBody,
  TableCell,
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
import { useAuditLogs } from "@/hooks/use-audit-logs";
import { ACTION_FILTERS } from "@/lib/audit-actions";
import { useState } from "react";

function AuditView() {
  const [actorType, setActorType] = useState("");
  const [action, setAction] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

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
          onChange={(v) => {
            setActorType(v);
            setPage(1);
          }}
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
          onChange={(v) => {
            setAction(v);
            setPage(1);
          }}
          options={[
            { value: "", label: "Tüm eylemler" },
            ...ACTION_FILTERS,
          ]}
        />
        <SearchInput
          value={search}
          onChange={(v) => {
            setSearch(v);
            setPage(1);
          }}
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
              <TableRow>
                <TableCell colSpan={5} className="text-center text-admin-text-muted py-8">
                  {query.isError
                    ? "Veri alınamadı — lütfen tekrar deneyin"
                    : query.isLoading
                      ? "Yükleniyor..."
                      : "Kayıt bulunamadı"}
                </TableCell>
              </TableRow>
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
