"use client";

import { Badge } from "@/components/catalyst/badge";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/catalyst/table";
import { AdminShell } from "@/components/layout/admin-shell";
import { RequireAdminAuth } from "@/components/providers/auth-hydration";
import { Button } from "@/components/ui/button";
import {
  useAdminConnections,
  useRemoveConnection,
  useUpdateConnection,
  type ConnectionItem,
} from "@/hooks/use-admin-connections";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { Link2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const STATUS_META: Record<
  string,
  { label: string; color: "green" | "amber" | "red" }
> = {
  ACTIVE: { label: "Aktif", color: "green" },
  PENDING_TENANT_APPROVAL: { label: "Onay bekliyor", color: "amber" },
  BLOCKED: { label: "Engelli", color: "red" },
};

function ConnectionsView() {
  const [status, setStatus] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useAdminConnections({
    status: status || undefined,
    search: search.trim() || undefined,
    page,
  });
  const update = useUpdateConnection();
  const remove = useRemoveConnection();

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  const setBlocked = (it: ConnectionItem) => {
    const reason = window.prompt("Engelleme sebebi (opsiyonel):") ?? undefined;
    update.mutate(
      { id: it.id, status: "BLOCKED", blockedReason: reason },
      {
        onSuccess: () => toast.success("Bağlantı engellendi"),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  const setActive = (it: ConnectionItem) =>
    update.mutate(
      { id: it.id, status: "ACTIVE" },
      {
        onSuccess: () =>
          toast.success(
            it.status === "PENDING_TENANT_APPROVAL"
              ? "Bağlantı onaylandı"
              : "Bağlantı aktifleştirildi",
          ),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );

  const removeConn = (it: ConnectionItem) => {
    if (!window.confirm("Bu bağlantı kalıcı olarak silinsin mi?")) return;
    remove.mutate(it.id, {
      onSuccess: () => toast.success("Bağlantı kaldırıldı"),
      onError: (e: unknown) =>
        toast.error(e instanceof Error ? e.message : "Hata"),
    });
  };

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-zinc-100 flex items-center justify-center">
          <Link2 className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-admin-text">
            Bağlantılar
          </h1>
          <p className="text-sm text-admin-text-muted">
            Tedarikçi ↔ alıcı bağlantıları — onayla, engelle, kaldır.
          </p>
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-3">
        <div className="w-48">
          <Select
            value={status}
            onChange={(e) => {
              setStatus(e.target.value);
              setPage(1);
            }}
            aria-label="Durum"
          >
            <option value="">Tüm durumlar</option>
            <option value="ACTIVE">Aktif</option>
            <option value="PENDING_TENANT_APPROVAL">Onay bekliyor</option>
            <option value="BLOCKED">Engelli</option>
          </Select>
        </div>
        <div className="w-64">
          <Input
            type="search"
            value={search}
            onChange={(e) => {
              setSearch(e.target.value);
              setPage(1);
            }}
            placeholder="Tedarikçi / alıcı adı ara..."
          />
        </div>
      </div>

      <div className="admin-card overflow-hidden">
        <Table dense>
          <TableHead>
            <TableRow>
              <TableHeader>Tedarikçi</TableHeader>
              <TableHeader>Alıcı</TableHeader>
              <TableHeader>Durum</TableHeader>
              <TableHeader>Tarih</TableHeader>
              <TableHeader className="text-right">İşlemler</TableHeader>
            </TableRow>
          </TableHead>
          <TableBody>
            {items.length === 0 ? (
              <TableRow>
                <TableCell colSpan={5} className="text-center text-admin-text-muted py-8">
                  {query.isLoading ? "Yükleniyor..." : "Bağlantı bulunamadı"}
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => {
                const meta = STATUS_META[it.status] ?? {
                  label: it.status,
                  color: "amber" as const,
                };
                const pending = update.isPending || remove.isPending;
                return (
                  <TableRow key={it.id}>
                    <TableCell className="font-medium text-admin-text">
                      {it.supplier.companyName}
                      {it.supplier.membership === "PREMIUM" ? (
                        <Badge color="amber" className="ml-2">PREMIUM</Badge>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-admin-text">
                      {it.tenant.name}
                    </TableCell>
                    <TableCell>
                      <Badge color={meta.color}>{meta.label}</Badge>
                      {it.blockedReason ? (
                        <div className="text-xs text-admin-text-muted mt-1 max-w-[160px] truncate">
                          {it.blockedReason}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell className="text-xs text-admin-text-muted whitespace-nowrap">
                      {format(new Date(it.createdAt), "d MMM yyyy", { locale: tr })}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-2">
                        {it.status === "BLOCKED" ? (
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            disabled={pending}
                            onClick={() => setActive(it)}
                          >
                            Engeli Kaldır
                          </Button>
                        ) : it.status === "PENDING_TENANT_APPROVAL" ? (
                          <Button
                            type="button"
                            size="sm"
                            disabled={pending}
                            onClick={() => setActive(it)}
                          >
                            Onayla
                          </Button>
                        ) : (
                          <Button
                            type="button"
                            variant="danger"
                            size="sm"
                            disabled={pending}
                            onClick={() => setBlocked(it)}
                          >
                            Engelle
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          disabled={pending}
                          onClick={() => removeConn(it)}
                        >
                          Kaldır
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>

      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-admin-text-muted">
            {pagination.total} bağlantı · Sayfa {pagination.page}/
            {pagination.totalPages}
          </span>
          <div className="flex gap-2">
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              Önceki
            </Button>
            <Button
              type="button"
              variant="secondary"
              size="sm"
              disabled={page >= pagination.totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              Sonraki
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export default function AdminConnectionsPage() {
  return (
    <RequireAdminAuth>
      <AdminShell>
        <ConnectionsView />
      </AdminShell>
    </RequireAdminAuth>
  );
}
