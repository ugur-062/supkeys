"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import {
  useCompanyAction,
  useCompanyDetail,
  type AdminCompanyDetail,
} from "@/hooks/use-admin-companies";
import { Check, FileText, Loader2, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

const VERIFY_META: Record<
  string,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  UNVERIFIED: { label: "Doğrulanmadı", color: "zinc" },
  PENDING: { label: "Onay bekliyor", color: "amber" },
  VERIFIED: { label: "Doğrulandı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

const DOC_FIELDS: { key: keyof AdminCompanyDetail; label: string }[] = [
  { key: "docTaxPlateUrl", label: "Vergi Levhası" },
  { key: "docTradeRegistryUrl", label: "Ticaret Sicil Gazetesi" },
  { key: "docSignatureCircularUrl", label: "İmza Sirküleri" },
  { key: "docActivityCertUrl", label: "Faaliyet Belgesi" },
  { key: "docIdFrontUrl", label: "Yetkili Kimlik (Ön)" },
  { key: "docIdBackUrl", label: "Yetkili Kimlik (Arka)" },
];

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-admin-text-muted">{label}</dt>
      <dd className="text-sm text-admin-text">{value || "—"}</dd>
    </div>
  );
}

/** Admin firma inceleme modalı — belgeler + KYC kimlik + Doğrula/Reddet. */
export function CompanyDetailModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useCompanyDetail(companyId);
  const act = useCompanyAction();
  const [rejectMode, setRejectMode] = useState(false);
  const [reason, setReason] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const doVerify = () =>
    act.mutate(
      { id: companyId, action: "verify" },
      {
        onSuccess: () => {
          toast.success("Firma doğrulandı");
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );

  const doReject = () => {
    if (reason.trim().length < 3) {
      toast.error("Red gerekçesi girin (firmaya gösterilecek)");
      return;
    }
    act.mutate(
      { id: companyId, action: "reject", reason: reason.trim() },
      {
        onSuccess: () => {
          toast.success("Firma reddedildi");
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-6 pb-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Firma inceleme"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-admin-surface shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between border-b border-admin-border px-5 py-4">
          <div className="min-w-0">
            <h2 className="truncate text-lg font-bold text-admin-text">
              {data?.name ?? "Yükleniyor…"}
            </h2>
            {data ? (
              <div className="mt-1 flex items-center gap-2">
                <Badge color={VERIFY_META[data.companyVerificationStatus]?.color}>
                  {VERIFY_META[data.companyVerificationStatus]?.label}
                </Badge>
                <span className="font-mono text-xs text-admin-text-muted">
                  {data.rothernId ?? "—"}
                </span>
              </div>
            ) : null}
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 hover:bg-admin-border/40"
            aria-label="Kapat"
          >
            <X className="h-5 w-5 text-admin-text-muted" />
          </button>
        </div>

        {/* Body */}
        <div className="flex-1 overflow-y-auto px-5 py-4">
          {isLoading || !data ? (
            <div className="flex items-center justify-center py-16">
              <Loader2 className="h-6 w-6 animate-spin text-admin-text-muted" />
            </div>
          ) : (
            <div className="space-y-6">
              {/* Kimlik bilgileri */}
              <section>
                <h3 className="text-sm font-semibold text-admin-text">
                  Kimlik Bilgileri
                </h3>
                <dl className="mt-3 grid grid-cols-2 gap-4">
                  <Row label="Ünvan" value={data.legalName} />
                  <Row label="Vergi No" value={data.taxNumber} />
                  <Row label="Vergi Dairesi" value={data.taxOffice} />
                  <Row label="MERSİS No" value={data.mersisNo} />
                  <Row label="Ticari Sicil No" value={data.tradeRegistryNo} />
                  <Row label="Ülke / Şehir" value={`${data.country}${data.city ? " / " + data.city : ""}`} />
                  <Row label="IBAN" value={data.iban} />
                  <Row label="IBAN Sahibi" value={data.ibanHolder} />
                </dl>
              </section>

              {/* Belgeler */}
              <section>
                <h3 className="text-sm font-semibold text-admin-text">
                  Belgeler
                </h3>
                <ul className="mt-3 divide-y divide-admin-border rounded-xl border border-admin-border">
                  {DOC_FIELDS.map((d) => {
                    const url = data[d.key] as string | null;
                    return (
                      <li
                        key={d.key}
                        className="flex items-center justify-between gap-3 px-4 py-2.5"
                      >
                        <span className="flex items-center gap-2 text-sm text-admin-text">
                          <FileText className="h-4 w-4 text-admin-text-muted" />
                          {d.label}
                          {url ? (
                            <span className="inline-flex items-center gap-1 text-xs text-emerald-600">
                              <Check className="h-3.5 w-3.5" /> var
                            </span>
                          ) : (
                            <span className="text-xs text-admin-text-muted">
                              eksik
                            </span>
                          )}
                        </span>
                        {url ? (
                          <a
                            href={url}
                            target="_blank"
                            rel="noreferrer"
                            className="shrink-0 text-xs font-semibold text-blue-600 hover:underline"
                          >
                            Görüntüle
                          </a>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>

              {data.companyVerificationStatus === "REJECTED" &&
              data.companyRejectionReason ? (
                <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700">
                  Önceki red gerekçesi: {data.companyRejectionReason}
                </p>
              ) : null}
            </div>
          )}
        </div>

        {/* Footer — aksiyonlar */}
        {data ? (
          <div className="border-t border-admin-border px-5 py-3">
            {rejectMode ? (
              <div className="space-y-2">
                <textarea
                  value={reason}
                  onChange={(e) => setReason(e.target.value)}
                  rows={2}
                  autoFocus
                  placeholder="Red gerekçesi — firmaya gösterilecek (ör. imza sirküleri okunmuyor)"
                  className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-2 text-sm text-admin-text"
                />
                <div className="flex justify-end gap-2">
                  <Button variant="ghost" onClick={() => setRejectMode(false)}>
                    Vazgeç
                  </Button>
                  <Button
                    variant="danger"
                    onClick={doReject}
                    loading={act.isPending}
                  >
                    Reddet
                  </Button>
                </div>
              </div>
            ) : (
              <div className="flex items-center justify-end gap-2">
                {data.companyVerificationStatus !== "REJECTED" ? (
                  <Button variant="ghost" onClick={() => setRejectMode(true)}>
                    Reddet
                  </Button>
                ) : null}
                {data.companyVerificationStatus !== "VERIFIED" ? (
                  <Button onClick={doVerify} loading={act.isPending}>
                    Doğrula
                  </Button>
                ) : null}
              </div>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
