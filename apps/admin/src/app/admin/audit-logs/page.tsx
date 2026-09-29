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
import { safeFormat } from "@/lib/date";
import { ENTITY_TYPE_LABEL } from "@/lib/terms";
import { useState } from "react";

/**
 * Satırda gösterilen eylem etiketi (tam ad). Bilinmeyen eylem ham adıyla
 * görünür. Eski `supplier.*` / `tenant.*` etiketleri geçmiş satırlar için
 * duruyor; bugünkü yazım noktaları `company.*` ve `admin.*` kullanır.
 */
const ACTION_LABELS: Record<string, string> = {
  "auth.login": "Giriş",
  "auth.login_failed": "Başarısız giriş",
  "company.signup": "Firma kaydı",
  "company.profile.updated": "Firma profili güncellendi",
  "company.user.invited": "Kullanıcı davet edildi",
  "company.user.removed": "Kullanıcı çıkarıldı",
  "company.user.roles_changed": "Kullanıcı rolleri değişti",
  "company.ownership.transferred": "Firma sahipliği devredildi",
  "company.listing.published": "İlan yayınlandı",
  "company.listing.awarded": "İlan kazandırıldı",
  "company.listing.cancelled": "İlan iptal edildi",
  "company.bid.submitted": "Teklif verildi",
  "company.order.accepted": "Sipariş kabul edildi",
  "company.order.completed": "Sipariş tamamlandı",
  "company.order.cancelled": "Sipariş iptal edildi",
  "admin.company.suspended": "Admin: firma askıya alındı",
  "admin.company.unsuspended": "Admin: firma askısı kaldırıldı",
  "admin.company.tier_set": "Admin: paket değişti",
  "admin.company.verification_set": "Admin: doğrulama değişti",
  "admin.product.approved": "Admin: ürün onaylandı",
  "admin.product.rejected": "Admin: ürün reddedildi",
  "admin.user.deactivated": "Admin: kullanıcı pasifleştirildi",
  "admin.user.activated": "Admin: kullanıcı aktifleştirildi",
  "admin.user.password_reset_sent": "Admin: şifre sıfırlama bağlantısı gönderildi",
  "admin.staff.created": "Admin: personel eklendi",
  "admin.staff.role_set": "Admin: personel rolü değişti",
  "admin.staff.deactivated": "Admin: personel pasifleştirildi",
  "admin.staff.activated": "Admin: personel aktifleştirildi",
  "admin.staff.password_reset": "Admin: personel şifresi sıfırlandı",
  "admin.announcement.sent": "Admin: duyuru gönderildi",
  "admin.complaint.resolved": "Admin: şikayet sonuçlandırıldı",
  "auth.password_changed": "Şifre değiştirildi",
  "email.resent": "E-posta yeniden gönderildi",
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
  "tenant.user_password_reset": "Alıcı şifre sıfırlama",
  "demo.invite_sent": "Demo davet gönderildi",
  "demo.invite_revoked": "Demo davet iptal",
};

/**
 * Eylem süzgeci — ÖNEK grupları (API `action` alanını `startsWith` ile
 * süzer). Eskiden tam eylem adları listeleniyordu ve hepsi artık yazılmayan
 * `supplier.*` / `tenant.*` adlarıydı: her seçim 0 kayıt dönüyordu.
 */
const ACTION_FILTERS: { value: string; label: string }[] = [
  { value: "auth.", label: "Giriş olayları" },
  { value: "company.user.", label: "Firma: kullanıcı ve rol" },
  { value: "company.profile", label: "Firma: profil" },
  { value: "company.listing", label: "Firma: ilanlar" },
  { value: "company.bid", label: "Firma: teklifler" },
  { value: "company.order.", label: "Firma: siparişler" },
  { value: "company.product.", label: "Firma: ürünler" },
  { value: "company.connection.", label: "Firma: bağlantılar" },
  { value: "company.approval", label: "Firma: onay akışları" },
  { value: "company.docs.", label: "Firma: belgeler" },
  { value: "company.bank_account.", label: "Firma: banka hesapları" },
  { value: "admin.company.", label: "Admin: firma işlemleri" },
  { value: "admin.user.", label: "Admin: kullanıcı işlemleri" },
  { value: "admin.staff.", label: "Admin: personel" },
  { value: "admin.product.", label: "Admin: ürün onayı" },
  { value: "admin.listing.", label: "Admin: ilanlar" },
  { value: "admin.order.", label: "Admin: siparişler" },
  { value: "admin.system.", label: "Admin: sistem" },
  { value: "admin.announcement.", label: "Admin: duyurular" },
  { value: "admin.complaint.", label: "Admin: şikayetler" },
  { value: "email.resent", label: "E-posta yeniden gönderimi" },
];

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
