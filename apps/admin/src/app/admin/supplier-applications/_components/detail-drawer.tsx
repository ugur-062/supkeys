"use client";

import { ApplicationStatusBadge } from "@/components/ui/application-status-badge";
import { Button } from "@/components/ui/button";
import { useSupplierApplicationDetail } from "@/hooks/use-supplier-applications";
import { COMPANY_TYPE_LABEL } from "@/lib/applications/company-type";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  CheckCircle2,
  Copy,
  ExternalLink,
  FileText,
  Loader2,
  Mail,
  MailWarning,
  Phone,
  Send,
  User,
  X,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { TaxCertModal } from "../../buyer-applications/_components/tax-cert-modal";
import { ApproveSupplierDialog } from "./approve-dialog";
import { RejectSupplierModal } from "./reject-modal";

interface DetailDrawerProps {
  id: string | null;
  onClose: () => void;
}

function formatFull(date: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMMM yyyy HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

function formatRelative(date: string | null) {
  if (!date) return "—";
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: tr,
    });
  } catch {
    return "—";
  }
}

interface InfoRowProps {
  label: string;
  children: React.ReactNode;
}

function InfoRow({ label, children }: InfoRowProps) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-admin-text-muted">
        {label}
      </dt>
      <dd className="text-sm text-admin-text break-words">{children}</dd>
    </div>
  );
}

export function SupplierDetailDrawer({ id, onClose }: DetailDrawerProps) {
  const open = !!id;
  const detail = useSupplierApplicationDetail(id);
  const [approveOpen, setApproveOpen] = useState(false);
  const [rejectOpen, setRejectOpen] = useState(false);
  const [taxCertOpen, setTaxCertOpen] = useState(false);

  const item = detail.data;

  const copyEmail = (email: string) => {
    navigator.clipboard
      .writeText(email)
      .then(() => toast.success("E-posta kopyalandı"))
      .catch(() => toast.error("Kopyalanamadı"));
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/50 z-40" />
        <Dialog.Content
          className={cn(
            "fixed right-0 top-0 bottom-0 w-full md:max-w-2xl bg-admin-bg z-50 shadow-xl",
            "flex flex-col outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border bg-admin-surface flex items-center justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <Dialog.Title className="font-display font-bold text-lg text-admin-text truncate">
                Başvuru Detayı
              </Dialog.Title>
              {item && <ApplicationStatusBadge status={item.status} />}
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {detail.isLoading && (
              <div className="flex items-center justify-center py-16 text-admin-text-muted">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Yükleniyor…
              </div>
            )}

            {detail.isError && (
              <div className="p-4 rounded-lg bg-danger-50 border border-danger-500/30 text-danger-700 text-sm">
                Başvuru yüklenemedi.
              </div>
            )}

            {item && (
              <>
                {/* Davet banner — sadece tenant tarafından davet edildiyse */}
                {item.invitedByTenant ? (
                  <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-4">
                    <div className="flex items-start gap-3">
                      <Send className="w-5 h-5 text-indigo-600 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-indigo-700">
                          📩 Tedarikçi Daveti
                        </p>
                        <p className="text-xs text-indigo-600/90 mt-1">
                          <strong>{item.invitedByTenant.name}</strong> firması
                          tarafından davet edildi. Onay sonrası tenant ile aktif
                          ilişki otomatik kurulacak.
                        </p>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
                    <div className="flex items-start gap-3">
                      <User className="w-5 h-5 text-slate-500 shrink-0 mt-0.5" />
                      <div className="min-w-0">
                        <p className="text-sm font-semibold text-slate-700">
                          Self Kayıt
                        </p>
                        <p className="text-xs text-slate-600 mt-1">
                          Tedarikçi platformumuza kendi başvurdu.
                        </p>
                      </div>
                    </div>
                  </div>
                )}

                {/* Firma Bilgileri */}
                <section className="admin-card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Firma Bilgileri
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="Firma Adı">{item.companyName}</InfoRow>
                    <InfoRow label="Firma Tipi">
                      {COMPANY_TYPE_LABEL[item.companyType]}
                    </InfoRow>
                    <InfoRow label="Vergi Numarası">
                      <span className="font-mono">{item.taxNumber}</span>
                    </InfoRow>
                    <InfoRow label="Vergi Dairesi">{item.taxOffice}</InfoRow>
                    <InfoRow label="Sektör">{item.industry || "—"}</InfoRow>
                    <InfoRow label="Web Sitesi">
                      {item.website ? (
                        <a
                          href={item.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-700 hover:underline inline-flex items-center gap-1"
                        >
                          {item.website}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </InfoRow>
                  </dl>

                  <button
                    type="button"
                    onClick={() => setTaxCertOpen(true)}
                    className="w-full flex items-center gap-3 p-3 rounded-lg border border-admin-border hover:bg-surface-muted hover:border-brand-300 transition-colors text-left"
                  >
                    <div className="w-10 h-10 rounded-lg bg-brand-50 flex items-center justify-center shrink-0">
                      <FileText className="w-5 h-5 text-brand-600" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className="text-sm font-medium text-admin-text">
                        Vergi Levhası
                      </p>
                      <p className="text-xs text-admin-text-muted">
                        Görüntülemek için tıklayın
                      </p>
                    </div>
                    <ExternalLink className="w-4 h-4 text-admin-text-muted shrink-0" />
                  </button>
                </section>

                {/* Adres */}
                <section className="admin-card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Adres
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="İl">{item.city}</InfoRow>
                    <InfoRow label="İlçe">{item.district}</InfoRow>
                    <div className="md:col-span-2">
                      <InfoRow label="Açık Adres">
                        <span className="whitespace-pre-wrap">
                          {item.addressLine}
                        </span>
                      </InfoRow>
                    </div>
                    {item.postalCode && (
                      <InfoRow label="Posta Kodu">
                        <span className="font-mono">{item.postalCode}</span>
                      </InfoRow>
                    )}
                  </dl>
                </section>

                {/* Yetkili */}
                <section className="admin-card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Yetkili Kullanıcı
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="Ad Soyad">
                      {item.adminFirstName} {item.adminLastName}
                    </InfoRow>
                    <InfoRow label="Telefon">
                      {item.adminPhone ? (
                        <a
                          href={`tel:${item.adminPhone}`}
                          className="text-brand-700 hover:underline inline-flex items-center gap-1.5"
                        >
                          <Phone className="w-3.5 h-3.5" />
                          {item.adminPhone}
                        </a>
                      ) : (
                        "—"
                      )}
                    </InfoRow>
                    <div className="md:col-span-2">
                      <InfoRow label="E-posta">
                        <span className="inline-flex items-center gap-2">
                          <a
                            href={`mailto:${item.adminEmail}`}
                            className="text-brand-700 hover:underline inline-flex items-center gap-1.5"
                          >
                            <Mail className="w-3.5 h-3.5" />
                            {item.adminEmail}
                          </a>
                          <button
                            type="button"
                            onClick={() => copyEmail(item.adminEmail)}
                            className="p-1 rounded hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors"
                            title="Kopyala"
                          >
                            <Copy className="w-3.5 h-3.5" />
                          </button>
                        </span>
                      </InfoRow>
                    </div>
                  </dl>
                </section>

                {/* Süreç */}
                <section className="admin-card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-admin-text-muted">
                    Süreç
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="Başvuru Tarihi">
                      <span title={formatFull(item.createdAt)}>
                        {formatFull(item.createdAt)}
                      </span>
                      <div className="text-xs text-admin-text-muted">
                        {formatRelative(item.createdAt)}
                      </div>
                    </InfoRow>
                    <InfoRow label="E-posta Doğrulama">
                      {item.emailVerifiedAt
                        ? formatFull(item.emailVerifiedAt)
                        : "Bekliyor"}
                    </InfoRow>
                    {item.reviewedAt && (
                      <InfoRow label="İnceleme Tarihi">
                        {formatFull(item.reviewedAt)}
                        <div className="text-xs text-admin-text-muted">
                          {item.reviewedBy
                            ? `${item.reviewedBy.firstName} ${item.reviewedBy.lastName}`
                            : "Sistem"}
                        </div>
                      </InfoRow>
                    )}
                    {item.supplier && (
                      <InfoRow label="Tedarikçi">
                        {item.supplier.companyName}
                      </InfoRow>
                    )}
                    {item.rejectionReason && (
                      <div className="md:col-span-2">
                        <InfoRow label="Red Sebebi">
                          <span className="rounded-md bg-danger-50 border border-danger-200 px-2.5 py-1.5 text-xs text-danger-700 inline-block whitespace-pre-wrap">
                            {item.rejectionReason}
                          </span>
                        </InfoRow>
                      </div>
                    )}
                    {item.ipAddress && (
                      <div className="md:col-span-2 text-xs text-admin-text-muted">
                        IP: <span className="font-mono">{item.ipAddress}</span>
                      </div>
                    )}
                  </dl>
                </section>
              </>
            )}
          </div>

          {/* Sticky bottom actions */}
          {item && item.status === "PENDING_REVIEW" && (
            <footer className="px-5 py-4 border-t border-admin-border bg-admin-surface flex items-center gap-3 shrink-0">
              <Button
                type="button"
                onClick={() => setApproveOpen(true)}
                className="flex-1 !bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
              >
                <CheckCircle2 className="w-4 h-4" />
                Onayla
              </Button>
              <Button
                type="button"
                variant="secondary"
                onClick={() => setRejectOpen(true)}
                className="flex-1 !text-danger-600 !border-danger-200 hover:!bg-danger-50"
              >
                <XCircle className="w-4 h-4" />
                Reddet
              </Button>
            </footer>
          )}

          {item && item.status === "PENDING_EMAIL_VERIFICATION" && (
            <footer className="px-5 py-4 border-t border-admin-border bg-admin-surface shrink-0">
              <div className="rounded-lg bg-warning-50 border border-warning-200 px-3 py-2.5 flex items-start gap-2.5">
                <MailWarning className="w-4 h-4 text-warning-600 shrink-0 mt-0.5" />
                <p className="text-xs text-warning-700 leading-relaxed">
                  Tedarikçi henüz e-posta adresini doğrulamadı. Doğrulama
                  sonrası başvuru burada{" "}
                  <strong>İncelemede</strong> olarak listelenecek.
                </p>
              </div>
            </footer>
          )}
        </Dialog.Content>
      </Dialog.Portal>

      {item && (
        <>
          <ApproveSupplierDialog
            applicationId={item.id}
            companyName={item.companyName}
            invitedByTenantName={item.invitedByTenant?.name ?? null}
            open={approveOpen}
            onClose={() => setApproveOpen(false)}
            onApproved={() => {
              setApproveOpen(false);
              onClose();
            }}
          />
          <RejectSupplierModal
            applicationId={item.id}
            companyName={item.companyName}
            open={rejectOpen}
            onClose={() => setRejectOpen(false)}
            onRejected={() => {
              setRejectOpen(false);
              onClose();
            }}
          />
          <TaxCertModal
            taxCertUrl={item.taxCertUrl}
            companyName={item.companyName}
            open={taxCertOpen}
            onClose={() => setTaxCertOpen(false)}
          />
        </>
      )}
    </Dialog.Root>
  );
}
