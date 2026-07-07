"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import {
  useCompanyDetail,
  useReviewDocuments,
  type AdminCompanyDetail,
  type DocDecision,
  type DocKind,
  type DocStatus,
} from "@/hooks/use-admin-companies";
import { Check, FileText, Loader2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
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

// Belge türü → etiket + Company alanları (url/status/reason).
const DOCS: {
  key: DocKind;
  label: string;
  url: keyof AdminCompanyDetail;
  status: keyof AdminCompanyDetail;
  reason: keyof AdminCompanyDetail;
}[] = [
  { key: "taxPlate", label: "Vergi Levhası", url: "docTaxPlateUrl", status: "docTaxPlateStatus", reason: "docTaxPlateReason" },
  { key: "tradeRegistry", label: "Ticaret Sicil Gazetesi", url: "docTradeRegistryUrl", status: "docTradeRegistryStatus", reason: "docTradeRegistryReason" },
  { key: "signatureCircular", label: "İmza Sirküleri", url: "docSignatureCircularUrl", status: "docSignatureCircularStatus", reason: "docSignatureCircularReason" },
  { key: "activityCert", label: "Faaliyet Belgesi", url: "docActivityCertUrl", status: "docActivityCertStatus", reason: "docActivityCertReason" },
  { key: "idFront", label: "Yetkili Kimlik (Ön)", url: "docIdFrontUrl", status: "docIdFrontStatus", reason: "docIdFrontReason" },
  { key: "idBack", label: "Yetkili Kimlik (Arka)", url: "docIdBackUrl", status: "docIdBackStatus", reason: "docIdBackReason" },
];

// Zorunlu belge seti — TR: 6, yabancı: 3 (backend ile aynı mantık).
const FOREIGN_REQUIRED: DocKind[] = ["tradeRegistry", "taxPlate", "idFront"];
function requiredKinds(country: string | null | undefined): DocKind[] {
  const all = DOCS.map((d) => d.key);
  return (country ?? "TR").toUpperCase() === "TR"
    ? all
    : all.filter((k) => FOREIGN_REQUIRED.includes(k));
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-0.5">
      <dt className="text-xs font-medium text-admin-text-muted">{label}</dt>
      <dd className="text-sm text-admin-text">{value || "—"}</dd>
    </div>
  );
}

const DOC_BADGE: Record<
  DocStatus,
  { label: string; color: React.ComponentProps<typeof Badge>["color"] }
> = {
  PENDING: { label: "İnceleniyor", color: "amber" },
  APPROVED: { label: "Onaylı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

/** Admin firma inceleme modalı — belge bazlı Onayla/Reddet + KYC kimlik. */
export function CompanyDetailModal({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const { data, isLoading } = useCompanyDetail(companyId);
  const review = useReviewDocuments();
  // Belge bazlı kararlar (yerel taslak) — Kaydet'e basınca gönderilir.
  const [decisions, setDecisions] = useState<
    Partial<Record<DocKind, DocDecision>>
  >({});

  const required = useMemo(() => requiredKinds(data?.country), [data?.country]);

  // Mevcut belge durumlarını taslağa yükle (APPROVED/REJECTED ön-seçili).
  useEffect(() => {
    if (!data) return;
    const init: Partial<Record<DocKind, DocDecision>> = {};
    for (const d of DOCS) {
      const st = data[d.status] as DocStatus;
      if (st === "APPROVED") init[d.key] = { status: "APPROVED" };
      else if (st === "REJECTED")
        init[d.key] = {
          status: "REJECTED",
          reason: (data[d.reason] as string | null) ?? "",
        };
    }
    setDecisions(init);
  }, [data]);

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

  const setDecision = (k: DocKind, d: DocDecision | undefined) =>
    setDecisions((prev) => ({ ...prev, [k]: d }));

  const save = () => {
    if (!data) return;
    // Her zorunlu belge yüklü + karara bağlanmış olmalı; red → gerekçe.
    for (const k of required) {
      const meta = DOCS.find((d) => d.key === k)!;
      if (!data[meta.url]) {
        toast.error(`Eksik belge: ${meta.label}`);
        return;
      }
      const dec = decisions[k];
      if (!dec) {
        toast.error(`Karar verilmemiş belge: ${meta.label}`);
        return;
      }
      if (dec.status === "REJECTED" && (dec.reason?.trim().length ?? 0) < 3) {
        toast.error(`Red gerekçesi girin: ${meta.label}`);
        return;
      }
    }
    // Yalnız zorunlu belgelerin kararını gönder.
    const payload: Partial<Record<DocKind, DocDecision>> = {};
    for (const k of required) {
      const dec = decisions[k]!;
      payload[k] =
        dec.status === "REJECTED"
          ? { status: "REJECTED", reason: dec.reason!.trim() }
          : { status: "APPROVED" };
    }
    review.mutate(
      { id: companyId, decisions: payload },
      {
        onSuccess: (res) => {
          toast.success(
            res.status === "VERIFIED"
              ? "Firma doğrulandı"
              : "Karar kaydedildi — bazı belgeler reddedildi",
          );
          onClose();
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  const approveAll = () => {
    const next: Partial<Record<DocKind, DocDecision>> = {};
    for (const k of required) next[k] = { status: "APPROVED" };
    setDecisions((prev) => ({ ...prev, ...next }));
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

              {/* Belgeler — belge bazlı Onayla / Reddet */}
              <section>
                <div className="flex items-center justify-between">
                  <h3 className="text-sm font-semibold text-admin-text">
                    Belgeler
                  </h3>
                  <button
                    type="button"
                    onClick={approveAll}
                    className="text-xs font-medium text-blue-600 hover:underline"
                  >
                    Hepsini Onayla
                  </button>
                </div>
                <ul className="mt-3 divide-y divide-admin-border rounded-xl border border-admin-border">
                  {DOCS.filter((d) => required.includes(d.key)).map((d) => {
                    const url = data[d.url] as string | null;
                    const st = data[d.status] as DocStatus;
                    const dec = decisions[d.key];
                    return (
                      <li key={d.key} className="flex flex-col gap-2 px-4 py-3">
                        <div className="flex items-center justify-between gap-3">
                          <span className="flex items-center gap-2 text-sm text-admin-text">
                            <FileText className="h-4 w-4 text-admin-text-muted" />
                            {d.label}
                            {url ? (
                              <Badge color={DOC_BADGE[st].color}>
                                {DOC_BADGE[st].label}
                              </Badge>
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
                        </div>
                        {url ? (
                          <div className="flex flex-col gap-2">
                            <div className="flex gap-2">
                              <button
                                type="button"
                                onClick={() =>
                                  setDecision(d.key, { status: "APPROVED" })
                                }
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                  dec?.status === "APPROVED"
                                    ? "border-emerald-500 bg-emerald-50 text-emerald-700"
                                    : "border-admin-border text-admin-text-muted hover:bg-admin-border/30"
                                }`}
                              >
                                <Check className="h-3.5 w-3.5" /> Onayla
                              </button>
                              <button
                                type="button"
                                onClick={() =>
                                  setDecision(d.key, {
                                    status: "REJECTED",
                                    reason: dec?.reason ?? "",
                                  })
                                }
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1 text-xs font-medium ${
                                  dec?.status === "REJECTED"
                                    ? "border-red-500 bg-red-50 text-red-700"
                                    : "border-admin-border text-admin-text-muted hover:bg-admin-border/30"
                                }`}
                              >
                                <X className="h-3.5 w-3.5" /> Reddet
                              </button>
                            </div>
                            {dec?.status === "REJECTED" ? (
                              <input
                                value={dec.reason ?? ""}
                                onChange={(e) =>
                                  setDecision(d.key, {
                                    status: "REJECTED",
                                    reason: e.target.value,
                                  })
                                }
                                placeholder="Red gerekçesi — firmaya gösterilir (ör. belge okunmuyor)"
                                aria-label={`${d.label} red gerekçesi`}
                                className="w-full rounded-lg border border-admin-border bg-admin-surface px-3 py-1.5 text-xs text-admin-text"
                              />
                            ) : null}
                          </div>
                        ) : null}
                      </li>
                    );
                  })}
                </ul>
              </section>
            </div>
          )}
        </div>

        {/* Footer — kararı kaydet */}
        {data ? (
          <div className="flex items-center justify-end gap-2 border-t border-admin-border px-5 py-3">
            <Button variant="ghost" onClick={onClose}>
              Kapat
            </Button>
            <Button onClick={save} loading={review.isPending}>
              Kararı Kaydet
            </Button>
          </div>
        ) : null}
      </div>
    </div>
  );
}
