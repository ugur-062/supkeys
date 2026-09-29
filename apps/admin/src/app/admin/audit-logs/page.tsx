"use client";

import { Badge } from "@/components/catalyst/badge";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import {
  FilterSelect,
  PageHeader,
  Pagination,
  SearchInput,
} from "@/components/list";
import { useAuditLogs, type AuditLogItem } from "@/hooks/use-audit-logs";
import { ACTION_FILTERS, ACTION_LABELS } from "@/lib/audit-actions";
import { safeFormat } from "@/lib/date";
import { ENTITY_TYPE_LABEL } from "@/lib/terms";
import { useState } from "react";

const ACTOR_META: Record<
  string,
  { label: string; color: "zinc" | "blue" | "amber" | "green" }
> = {
  admin: { label: "Admin", color: "blue" },
  company: { label: "Firma", color: "green" },
  // Eski aktör tipleri — yalnız geçmiş satırlar; süzgeçte sunulmaz.
  tenant: { label: "Alıcı", color: "green" },
  supplier: { label: "Tedarikçi", color: "amber" },
  system: { label: "Sistem", color: "zinc" },
};

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
              items.map((it) => <AuditRow key={it.id} item={it} />)
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

function AuditRow({ item }: { item: AuditLogItem }) {
  const actor = ACTOR_META[item.actorType] ?? {
    label: item.actorType,
    color: "zinc" as const,
  };
  const metaStr = item.metadata
    ? Object.entries(item.metadata)
        .filter(([, v]) => v !== undefined && v !== null)
        .map(([k, v]) => `${k}: ${Array.isArray(v) ? v.join(",") : String(v)}`)
        .join(" · ")
    : "";

  return (
    <TableRow>
      <TableCell className="whitespace-nowrap text-xs text-admin-text-muted">
        {safeFormat(item.createdAt, "d MMM yyyy HH:mm")}
      </TableCell>
      <TableCell>
        <Badge color={actor.color}>{actor.label}</Badge>
        <div className="text-xs text-admin-text-muted mt-1 truncate max-w-[160px]">
          {item.actorEmail ?? item.actorId ?? "—"}
        </div>
      </TableCell>
      <TableCell className="font-medium text-admin-text">
        {ACTION_LABELS[item.action] ?? item.action}
      </TableCell>
      <TableCell className="text-xs text-admin-text-muted">
        {item.entityType ? (
          <>
            {ENTITY_TYPE_LABEL[item.entityType] ?? item.entityType}
            {item.entityId ? (
              <span className="font-mono"> · {item.entityId.slice(0, 10)}</span>
            ) : null}
          </>
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="text-xs text-admin-text-muted max-w-[280px] truncate">
        {metaStr || "—"}
      </TableCell>
    </TableRow>
  );
}

export default function AuditLogsPage() {
  return (
    <AdminShell>
      <AuditView />
    </AdminShell>
  );
}
