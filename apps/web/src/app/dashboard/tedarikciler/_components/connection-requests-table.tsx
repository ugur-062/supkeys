"use client";

import { EmptyState, ListSkeleton } from "@/components/list";
import { Button } from "@/components/ui/button";
import {
  useApproveConnectionRequest,
  useConnectionRequests,
  useRejectConnectionRequest,
  type ConnectionRequest,
} from "@/hooks/use-connection-requests";
import { extractErrorMessage } from "@/lib/tenders/error";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  BadgeCheck,
  Building2,
  Check,
  FileText,
  Globe,
  Handshake,
  MapPin,
  X,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const COMPANY_TYPE_LABEL: Record<string, string> = {
  JOINT_STOCK: "Anonim Şirket",
  LIMITED: "Limited Şirket",
  SOLE_PROPRIETOR: "Şahıs Şirketi",
};

export function ConnectionRequestsTable() {
  const list = useConnectionRequests();
  const approveMutation = useApproveConnectionRequest();
  const rejectMutation = useRejectConnectionRequest();
  const [busyId, setBusyId] = useState<string | null>(null);

  const handleApprove = async (req: ConnectionRequest) => {
    setBusyId(req.id);
    try {
      await approveMutation.mutateAsync(req.id);
      toast.success(`${req.supplier.companyName} tedarikçiniz oldu`);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Onaylanamadı"));
    } finally {
      setBusyId(null);
    }
  };

  const handleReject = async (req: ConnectionRequest) => {
    if (!confirm(`${req.supplier.companyName} isteğini reddetmek istiyor musunuz?`))
      return;
    setBusyId(req.id);
    try {
      await rejectMutation.mutateAsync(req.id);
      toast.success("İstek reddedildi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "İşlem başarısız"));
    } finally {
      setBusyId(null);
    }
  };

  if (list.isLoading) return <ListSkeleton rows={3} />;

  if (!list.data || list.data.length === 0) {
    return (
      <EmptyState
        icon={Handshake}
        title="Bekleyen istek yok"
        description="Firmanızın public profilinden gelen 'Tedarikçi Ol' istekleri burada görünür."
      />
    );
  }

  return (
    <div className="space-y-3">
      {list.data.map((req) => {
        const s = req.supplier;
        const busy = busyId === req.id;
        return (
          <div
            key={req.id}
            className="rounded-2xl border border-surface-border bg-white p-5"
          >
            <div className="flex flex-col lg:flex-row lg:items-start lg:justify-between gap-4">
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2 flex-wrap">
                  <Building2 className="h-4 w-4 text-slate-400 shrink-0" />
                  <span className="font-semibold text-brand-900">
                    {s.companyName}
                  </span>
                  <span className="inline-flex items-center gap-1 rounded-md bg-success-50 border border-success-200 px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-success-700">
                    <BadgeCheck className="h-3 w-3" />
                    Doğrulandı
                  </span>
                  <span className="text-xs text-slate-400">
                    {COMPANY_TYPE_LABEL[s.companyType] ?? s.companyType}
                  </span>
                </div>

                <dl className="mt-3 grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-2 text-sm">
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Vergi No / Dairesi
                    </dt>
                    <dd className="text-brand-900">
                      <span className="font-mono">{s.taxNumber}</span> ·{" "}
                      {s.taxOffice}
                    </dd>
                  </div>
                  <div>
                    <dt className="text-xs uppercase tracking-wide text-slate-500">
                      Konum
                    </dt>
                    <dd className="text-brand-900 inline-flex items-center gap-1">
                      <MapPin className="h-3.5 w-3.5 text-slate-400" />
                      {s.city} / {s.district}
                    </dd>
                  </div>
                  {s.industry ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
                        Sektör
                      </dt>
                      <dd className="text-brand-900">{s.industry}</dd>
                    </div>
                  ) : null}
                  {s.website ? (
                    <div>
                      <dt className="text-xs uppercase tracking-wide text-slate-500">
                        Web
                      </dt>
                      <dd>
                        <a
                          href={s.website}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1 text-brand-700 hover:underline"
                        >
                          <Globe className="h-3.5 w-3.5" />
                          {s.website}
                        </a>
                      </dd>
                    </div>
                  ) : null}
                </dl>

                {s.categories.length > 0 ? (
                  <div className="mt-3 flex flex-wrap gap-1.5">
                    {s.categories.map((c, i) => (
                      <span
                        key={i}
                        className="inline-flex items-center rounded-md bg-slate-100 px-2 py-0.5 text-xs text-slate-600"
                      >
                        {c.segmentLetter ? `${c.segmentLetter}. ` : ""}
                        {c.nameTr}
                      </span>
                    ))}
                  </div>
                ) : null}

                <div className="mt-3 flex items-center gap-4 text-xs text-slate-500">
                  <a
                    href={s.taxCertUrl}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1.5 font-semibold text-brand-700 hover:underline"
                  >
                    <FileText className="h-4 w-4" />
                    Vergi Levhası
                  </a>
                  <span>
                    İstek:{" "}
                    {format(new Date(req.requestedAt), "dd.MM.yyyy HH:mm", {
                      locale: tr,
                    })}
                  </span>
                </div>
              </div>

              <div className="flex lg:flex-col gap-2 shrink-0">
                <Button
                  variant="primary"
                  size="sm"
                  onClick={() => handleApprove(req)}
                  loading={busy && approveMutation.isPending}
                  disabled={busy}
                >
                  <Check className="h-4 w-4" />
                  Onayla
                </Button>
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleReject(req)}
                  disabled={busy}
                >
                  <X className="h-4 w-4" />
                  Reddet
                </Button>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
