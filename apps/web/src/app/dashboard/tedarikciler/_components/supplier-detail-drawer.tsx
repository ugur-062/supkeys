"use client";

import { Button } from "@/components/ui/button";
import {
  useSupplierDetail,
  useUnblockSupplier,
} from "@/hooks/use-tenant-suppliers";
import {
  COMPANY_TYPE_LABEL,
  MEMBERSHIP_META,
} from "@/lib/tedarikciler/membership";
import { RELATION_STATUS_META } from "@/lib/tedarikciler/status";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import * as DropdownMenu from "@radix-ui/react-dropdown-menu";
import axios from "axios";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Ban,
  Building2,
  CheckCircle2,
  ChevronDown,
  Copy,
  ExternalLink,
  Loader2,
  Mail,
  Phone,
  Sparkles,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { BlockSupplierModal } from "./block-supplier-modal";

interface SupplierDetailDrawerProps {
  relationId: string | null;
  onClose: () => void;
  canManage: boolean;
}

function formatFull(date: string | null) {
  if (!date) return "—";
  try {
    return format(new Date(date), "dd MMMM yyyy HH:mm", { locale: tr });
  } catch {
    return "—";
  }
}

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

function InfoRow({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <div className="space-y-0.5">
      <dt className="text-xs uppercase tracking-wide text-slate-500">
        {label}
      </dt>
      <dd className="text-sm text-brand-900 break-words">{children}</dd>
    </div>
  );
}

function PlaceholderSection({
  title,
  subtitle,
}: {
  title: string;
  subtitle: string;
}) {
  return (
    <div className="card p-5 space-y-2 opacity-70">
      <div className="flex items-center gap-2">
        <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
          {title}
        </h3>
        <span className="px-1.5 py-0.5 bg-warning-100 text-warning-700 text-[10px] rounded-md font-semibold uppercase tracking-wide">
          Yakında
        </span>
      </div>
      <p className="text-xs text-slate-500 leading-relaxed">{subtitle}</p>
    </div>
  );
}

export function SupplierDetailDrawer({
  relationId,
  onClose,
  canManage,
}: SupplierDetailDrawerProps) {
  const open = !!relationId;
  const detail = useSupplierDetail(relationId);
  const unblock = useUnblockSupplier(relationId ?? "");
  const [blockOpen, setBlockOpen] = useState(false);

  const item = detail.data;

  const copy = (value: string, label: string) => {
    navigator.clipboard
      .writeText(value)
      .then(() => toast.success(`${label} kopyalandı`))
      .catch(() => toast.error("Kopyalanamadı"));
  };

  const handleUnblock = () => {
    unblock.mutate(undefined, {
      onSuccess: () => toast.success("Engel kaldırıldı"),
      onError: (err) =>
        toast.error(getErrorMessage(err, "Engel kaldırılamadı")),
    });
  };

  const membership = item ? MEMBERSHIP_META[item.supplier.membership] : null;
  const relStatus = item ? RELATION_STATUS_META[item.relationStatus] : null;
  const primaryUser = item?.supplier.users[0];

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
            "fixed right-0 top-0 bottom-0 w-full md:max-w-2xl bg-surface-subtle z-50 shadow-xl",
            "flex flex-col outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border bg-white flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-start gap-3 min-w-0">
              <div className="h-12 w-12 rounded-xl bg-slate-100 flex items-center justify-center flex-shrink-0">
                <Building2 className="h-6 w-6 text-slate-400" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900 truncate">
                  {item?.supplier.companyName ?? "Tedarikçi Detayı"}
                </Dialog.Title>
                {item && (
                  <p className="text-xs text-slate-500 mt-0.5 font-mono">
                    {item.supplier.taxNumber}
                  </p>
                )}
                {item && membership && relStatus && (
                  <div className="flex flex-wrap gap-1.5 mt-2">
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        membership.badgeClass,
                      )}
                    >
                      <Sparkles className="w-3 h-3 mr-1" />
                      {membership.label}
                    </span>
                    <span
                      className={cn(
                        "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                        relStatus.badgeClass,
                      )}
                    >
                      {relStatus.label}
                    </span>
                  </div>
                )}
              </div>
            </div>

            <div className="flex items-center gap-1.5 shrink-0">
              {item && canManage && (
                <DropdownMenu.Root>
                  <DropdownMenu.Trigger asChild>
                    <Button variant="secondary" size="sm">
                      Tüm İşlemler
                      <ChevronDown className="h-4 w-4" />
                    </Button>
                  </DropdownMenu.Trigger>
                  <DropdownMenu.Portal>
                    <DropdownMenu.Content
                      align="end"
                      sideOffset={4}
                      className="z-[60] min-w-[200px] rounded-lg border border-surface-border bg-white p-1 shadow-lg"
                    >
                      {item.relationStatus === "ACTIVE" && (
                        <DropdownMenu.Item
                          onSelect={() => setBlockOpen(true)}
                          className="flex items-center px-2 py-1.5 text-sm rounded-md hover:bg-danger-50 text-danger-600 cursor-pointer outline-none"
                        >
                          <Ban className="h-4 w-4 mr-2" />
                          Engelle
                        </DropdownMenu.Item>
                      )}
                      {item.relationStatus === "BLOCKED" && (
                        <DropdownMenu.Item
                          onSelect={handleUnblock}
                          disabled={unblock.isPending}
                          className="flex items-center px-2 py-1.5 text-sm rounded-md hover:bg-brand-50 text-brand-700 cursor-pointer outline-none"
                        >
                          <CheckCircle2 className="h-4 w-4 mr-2" />
                          Engeli Kaldır
                        </DropdownMenu.Item>
                      )}
                    </DropdownMenu.Content>
                  </DropdownMenu.Portal>
                </DropdownMenu.Root>
              )}
              <Dialog.Close asChild>
                <button
                  aria-label="Kapat"
                  className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors"
                >
                  <X className="w-4 h-4" />
                </button>
              </Dialog.Close>
            </div>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-5">
            {detail.isLoading && (
              <div className="flex items-center justify-center py-16 text-slate-500">
                <Loader2 className="w-5 h-5 animate-spin mr-2" />
                Yükleniyor…
              </div>
            )}

            {detail.isError && (
              <div className="p-4 rounded-lg bg-danger-50 border border-danger-500/30 text-danger-700 text-sm">
                Tedarikçi yüklenemedi.
              </div>
            )}

            {item && (
              <>
                {item.relationStatus === "BLOCKED" && (
                  <div className="rounded-xl bg-danger-50 border border-danger-200 p-4 space-y-1">
                    <h4 className="font-semibold text-danger-700 text-sm">
                      🚫 Bu tedarikçi engellenmiş
                    </h4>
                    {item.blockedReason && (
                      <p className="text-xs text-danger-700/90 whitespace-pre-wrap">
                        Sebep: {item.blockedReason}
                      </p>
                    )}
                    {item.blockedAt && (
                      <p className="text-xs text-danger-600/80">
                        {formatFull(item.blockedAt)}
                      </p>
                    )}
                  </div>
                )}

                <section className="card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Firma Bilgileri
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="Firma Tipi">
                      {COMPANY_TYPE_LABEL[item.supplier.companyType]}
                    </InfoRow>
                    <InfoRow label="Vergi Numarası">
                      <span className="font-mono">
                        {item.supplier.taxNumber}
                      </span>
                    </InfoRow>
                    <InfoRow label="Vergi Dairesi">
                      {item.supplier.taxOffice}
                    </InfoRow>
                    <InfoRow label="Sektör">
                      {item.supplier.industry || "—"}
                    </InfoRow>
                    <InfoRow label="Web Sitesi">
                      {item.supplier.website ? (
                        <a
                          href={item.supplier.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-brand-700 hover:underline inline-flex items-center gap-1"
                        >
                          {item.supplier.website}
                          <ExternalLink className="w-3 h-3" />
                        </a>
                      ) : (
                        "—"
                      )}
                    </InfoRow>
                  </dl>
                </section>

                <section className="card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Adres
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="İl / İlçe">
                      {item.supplier.city} / {item.supplier.district}
                    </InfoRow>
                    {item.supplier.postalCode && (
                      <InfoRow label="Posta Kodu">
                        <span className="font-mono">
                          {item.supplier.postalCode}
                        </span>
                      </InfoRow>
                    )}
                    <div className="md:col-span-2">
                      <InfoRow label="Açık Adres">
                        <span className="whitespace-pre-wrap">
                          {item.supplier.addressLine}
                        </span>
                      </InfoRow>
                    </div>
                  </dl>
                </section>

                <section className="card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    İletişim
                  </h3>
                  {primaryUser ? (
                    <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                      <InfoRow label="Yetkili">
                        {primaryUser.firstName} {primaryUser.lastName}
                      </InfoRow>
                      <InfoRow label="Telefon">
                        {primaryUser.phone ? (
                          <a
                            href={`tel:${primaryUser.phone}`}
                            className="text-brand-700 hover:underline inline-flex items-center gap-1.5"
                          >
                            <Phone className="w-3.5 h-3.5" />
                            {primaryUser.phone}
                          </a>
                        ) : (
                          "—"
                        )}
                      </InfoRow>
                      <div className="md:col-span-2">
                        <InfoRow label="E-posta">
                          <span className="inline-flex items-center gap-2">
                            <a
                              href={`mailto:${primaryUser.email}`}
                              className="text-brand-700 hover:underline inline-flex items-center gap-1.5"
                            >
                              <Mail className="w-3.5 h-3.5" />
                              {primaryUser.email}
                            </a>
                            <button
                              type="button"
                              onClick={() =>
                                copy(primaryUser.email, "E-posta")
                              }
                              className="p-1 rounded hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors"
                              title="Kopyala"
                            >
                              <Copy className="w-3.5 h-3.5" />
                            </button>
                          </span>
                        </InfoRow>
                      </div>
                    </dl>
                  ) : (
                    <p className="text-sm text-slate-500">
                      Bu tedarikçinin henüz tanımlı kullanıcısı yok.
                    </p>
                  )}
                </section>

                <section className="card p-5 space-y-4">
                  <h3 className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    İlişki
                  </h3>
                  <dl className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <InfoRow label="Bağlantı Tarihi">
                      {formatFull(item.relationCreatedAt)}
                    </InfoRow>
                    <InfoRow label="Üyelik">
                      {membership?.label ?? "—"}
                    </InfoRow>
                    <InfoRow label="Statü">
                      {relStatus?.label ?? "—"}
                    </InfoRow>
                  </dl>
                </section>

                <PlaceholderSection
                  title="Performans"
                  subtitle="Tamamlanan ihaleler, ortalama yanıt süresi, başarı oranı vb."
                />
                <PlaceholderSection
                  title="Kategori Bilgileri"
                  subtitle="Tedarikçinin hizmet verdiği kategoriler ve uzmanlık alanları."
                />
                <PlaceholderSection
                  title="İletişim Geçmişi"
                  subtitle="Geçmiş ihaleler, gönderilen mesajlar ve etkileşimler."
                />
              </>
            )}
          </div>
        </Dialog.Content>
      </Dialog.Portal>

      {item && canManage && (
        <BlockSupplierModal
          relationId={item.relationId}
          companyName={item.supplier.companyName}
          open={blockOpen}
          onClose={() => setBlockOpen(false)}
          onBlocked={() => {
            setBlockOpen(false);
            onClose();
          }}
        />
      )}
    </Dialog.Root>
  );
}
