"use client";

import { Button } from "@/components/ui/button";
import {
  useApproveRelation,
  usePendingRelations,
} from "@/hooks/use-tenant-suppliers";
import {
  COMPANY_TYPE_SHORT_LABEL,
  MEMBERSHIP_META,
} from "@/lib/tedarikciler/membership";
import type { PendingRelationItem } from "@/lib/tedarikciler/types";
import { cn } from "@/lib/utils";
import axios from "axios";
import { formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import {
  Building2,
  CheckCircle2,
  Clock,
  Mail,
  Phone,
  Users2,
  XCircle,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";
import { RejectRelationModal } from "./reject-relation-modal";

function formatRelative(date: string) {
  try {
    return formatDistanceToNow(new Date(date), {
      addSuffix: true,
      locale: tr,
    });
  } catch {
    return "—";
  }
}

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function PendingRelationsTable({ canManage }: { canManage: boolean }) {
  const { data, isLoading, isError, refetch } = usePendingRelations();

  if (isError) {
    return (
      <div className="card p-12 text-center space-y-3">
        <p className="text-brand-900 font-medium">Veri alınamadı.</p>
        <Button variant="secondary" size="sm" onClick={() => refetch()}>
          Tekrar dene
        </Button>
      </div>
    );
  }

  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <div
            key={i}
            className="card p-5 h-[120px] animate-pulse bg-slate-50"
          />
        ))}
      </div>
    );
  }

  const items = data?.items ?? [];

  if (items.length === 0) {
    return (
      <div className="card p-12 text-center">
        <div className="w-14 h-14 rounded-full bg-slate-100 flex items-center justify-center mx-auto">
          <Users2 className="h-7 w-7 text-slate-400" />
        </div>
        <p className="font-display font-bold text-lg text-brand-900 mt-3">
          Onay bekleyen tedarikçi yok
        </p>
        <p className="text-sm text-slate-500 mt-1 max-w-md mx-auto">
          Davet ettiğiniz tedarikçiler hesaplarıyla daveti kabul ettiklerinde
          burada görünür.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {items.map((rel) => (
        <PendingRelationCard
          key={rel.relationId}
          relation={rel}
          canManage={canManage}
        />
      ))}
    </div>
  );
}

interface PendingRelationCardProps {
  relation: PendingRelationItem;
  canManage: boolean;
}

function PendingRelationCard({ relation, canManage }: PendingRelationCardProps) {
  const [rejectOpen, setRejectOpen] = useState(false);
  const approve = useApproveRelation(relation.relationId);
  const membership = MEMBERSHIP_META[relation.supplier.membership];
  const primary = relation.supplier.primaryUser;

  const handleApprove = () => {
    approve.mutate(undefined, {
      onSuccess: () => {
        toast.success(
          `${relation.supplier.companyName} onaylandı, tedarikçiye e-posta gönderildi`,
        );
      },
      onError: (err) => {
        toast.error(getErrorMessage(err, "Onay başarısız"));
      },
    });
  };

  return (
    <article className="card p-5 border-warning-200 bg-warning-50/40">
      <div className="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
        <div className="flex gap-4 flex-1 min-w-0">
          <div className="h-12 w-12 rounded-xl bg-white border border-surface-border flex items-center justify-center flex-shrink-0">
            <Building2 className="h-6 w-6 text-slate-400" />
          </div>
          <div className="flex-1 min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h3 className="font-display font-bold text-brand-900 truncate">
                {relation.supplier.companyName}
              </h3>
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-full text-[11px] font-medium border",
                  membership.badgeClass,
                )}
              >
                {membership.label}
              </span>
              <span className="inline-flex items-center gap-1 text-[11px] text-warning-700 bg-warning-100 border border-warning-200 px-2 py-0.5 rounded-full font-medium">
                <Clock className="h-3 w-3" />
                Onay bekliyor
              </span>
            </div>
            <p className="text-xs text-slate-500">
              {COMPANY_TYPE_SHORT_LABEL[relation.supplier.companyType]} · VKN:{" "}
              <span className="font-mono">{relation.supplier.taxNumber}</span>
            </p>
            <p className="text-xs text-slate-500">
              {relation.supplier.city} / {relation.supplier.district}
              {relation.supplier.industry
                ? ` · ${relation.supplier.industry}`
                : ""}
            </p>
            {primary && (
              <p className="text-xs text-slate-600 pt-1">
                <span className="text-slate-400 mr-1">Yetkili:</span>
                {primary.firstName} {primary.lastName}
                <a
                  href={`mailto:${primary.email}`}
                  className="ml-2 inline-flex items-center gap-1 text-brand-700 hover:underline"
                >
                  <Mail className="h-3 w-3" />
                  {primary.email}
                </a>
                {primary.phone && (
                  <a
                    href={`tel:${primary.phone}`}
                    className="ml-2 inline-flex items-center gap-1 text-slate-600 hover:text-brand-700"
                  >
                    <Phone className="h-3 w-3" />
                    {primary.phone}
                  </a>
                )}
              </p>
            )}
            <p className="text-xs text-slate-400 pt-1">
              {formatRelative(relation.createdAt)} talep etti
            </p>
          </div>
        </div>

        <div className="flex flex-col sm:flex-row md:flex-col gap-2 flex-shrink-0 md:min-w-[140px]">
          <Button
            type="button"
            onClick={handleApprove}
            disabled={!canManage || approve.isPending}
            loading={approve.isPending}
            className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
          >
            <CheckCircle2 className="h-4 w-4" />
            Onayla
          </Button>
          <Button
            type="button"
            variant="secondary"
            onClick={() => setRejectOpen(true)}
            disabled={!canManage || approve.isPending}
            className="!text-danger-600 !border-danger-200 hover:!bg-danger-50"
          >
            <XCircle className="h-4 w-4" />
            Reddet
          </Button>
        </div>
      </div>

      <RejectRelationModal
        relationId={relation.relationId}
        supplierName={relation.supplier.companyName}
        open={rejectOpen}
        onClose={() => setRejectOpen(false)}
      />
    </article>
  );
}
