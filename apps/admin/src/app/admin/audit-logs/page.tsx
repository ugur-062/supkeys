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
import { useAuditLogs, type AuditLogItem } from "@/hooks/use-audit-logs";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { ScrollText } from "lucide-react";
import { useState } from "react";

const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Giriş",
  "auth.login_failed": "Başarısız giriş",
  "supplier.updated": "Tedarikçi güncellendi",
  "supplier.blocked": "Tedarikçi engellendi",
  "supplier.unblocked": "Tedarikçi engeli kaldırıldı",
  "supplier.membership_changed": "Tedarikçi üyeliği değişti",
  "supplier.user_activated": "Tedarikçi kullanıcı aktif",
  "supplier.user_deactivated": "Tedarikçi kullanıcı pasif",
  "supplier.user_email_verified": "Tedarikçi e-posta doğrulandı",
  "supplier.user_2fa_reset": "Tedarikçi 2FA sıfırlandı",
  "supplier.user_email_changed": "Tedarikçi e-posta değişti",
  "tenant.user_updated": "Alıcı kullanıcı güncellendi",
  "tenant.user_email_verified": "Alıcı e-posta doğrulandı",
  "tenant.user_2fa_reset": "Alıcı 2FA sıfırlandı",
  "tenant.user_email_changed": "Alıcı e-posta değişti",
  "tenant.user_password_reset": "Alıcı parola sıfırlama",
  "demo.invite_sent": "Demo davet gönderildi",
  "demo.invite_revoked": "Demo davet iptal",
};

const ACTOR_META: Record<
  string,
  { label: string; color: "zinc" | "blue" | "amber" | "green" }
> = {
  admin: { label: "Admin", color: "blue" },
  tenant: { label: "Alıcı", color: "green" },
  supplier: { label: "Tedarikçi", color: "amber" },
  system: { label: "Sistem", color: "zinc" },
};

function AuditView() {
  const [actorType, setActorType] = useState("");
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const query = useAuditLogs({
    actorType: actorType || undefined,
    search: search.trim() || undefined,
    page,
  });

  const items = query.data?.items ?? [];
  const pagination = query.data?.pagination;

  return (
    <div className="space-y-6 max-w-[1200px]">
      <div className="flex items-start gap-3">
        <div className="h-11 w-11 rounded-xl bg-zinc-100 flex items-center justify-center">
          <ScrollText className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <h1 className="text-2xl font-display font-bold text-admin-text">
            Denetim Kaydı
          </h1>
          <p className="text-sm text-admin-text-muted">
            Sistemdeki tüm hesap ve destek işlemleri (kim, ne, ne zaman).
          </p>
        </div>
      </div>

      {/* Filtreler */}
      <div className="flex flex-wrap items-center gap-3">
        <div className="w-44">
          <Select
            value={actorType}
            onChange={(e) => {
              setActorType(e.target.value);
              setPage(1);
            }}
            aria-label="Aktör tipi"
          >
            <option value="">Tüm aktörler</option>
            <option value="admin">Admin</option>
            <option value="tenant">Alıcı</option>
            <option value="supplier">Tedarikçi</option>
            <option value="system">Sistem</option>
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
            placeholder="E-posta, eylem, varlık ID ara..."
          />
        </div>
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
                  {query.isLoading ? "Yükleniyor..." : "Kayıt bulunamadı"}
                </TableCell>
              </TableRow>
            ) : (
              items.map((it) => <AuditRow key={it.id} item={it} />)
            )}
          </TableBody>
        </Table>
      </div>

      {/* Sayfalama */}
      {pagination && pagination.totalPages > 1 ? (
        <div className="flex items-center justify-between text-sm">
          <span className="text-admin-text-muted">
            {pagination.total} kayıt · Sayfa {pagination.page}/
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
        {format(new Date(item.createdAt), "d MMM yyyy HH:mm", { locale: tr })}
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
            {item.entityType}
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
    <RequireAdminAuth>
      <AdminShell>
        <AuditView />
      </AdminShell>
    </RequireAdminAuth>
  );
}
