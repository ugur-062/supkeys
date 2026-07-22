"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/ui/button";
import {
  useReviewDocRevision,
  useReviewDocuments,
  type AdminCompanyDetail,
  type DocDecision,
  type DocKind,
  type DocStatus,
} from "@/hooks/use-admin-companies";
import { Check, FileText, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

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

// Zorunlu belge seti — TR: 6, yabancı: 3 (backend requiredKinds ile aynı).
const FOREIGN_REQUIRED: DocKind[] = ["tradeRegistry", "taxPlate", "idFront"];
function requiredKinds(country: string | null | undefined): DocKind[] {
  const all = DOCS.map((d) => d.key);
  return (country ?? "TR").toUpperCase() === "TR"
    ? all
    : all.filter((k) => FOREIGN_REQUIRED.includes(k));
}

const DOC_BADGE: Record<
  DocStatus,
  { label: string; color: "amber" | "green" | "red" }
> = {
  PENDING: { label: "İnceleme Bekliyor", color: "amber" },
  APPROVED: { label: "Onaylı", color: "green" },
  REJECTED: { label: "Reddedildi", color: "red" },
};

/** Hazır red gerekçeleri — tıklayınca input'a dolar (elle düzenlenebilir). */
const REJECT_TEMPLATES = [
  "Belge okunmuyor / bulanık",
  "Yanlış belge yüklenmiş",
  "Belge güncel değil (son 3 ay içinde alınmış olmalı)",
  "Belgedeki bilgiler firma bilgileriyle uyuşmuyor",
  "İmza / kaşe Yüklenmedi",
];

/**
 * Belgeler — KYC belge bazlı inceleme (eski modalın portu). Yabancı firmada
 * zorunlu set 3 belgeye iner; hangi belgelerin istendiği açıkça görünür.
 */
export function DocsTab({
  companyId,
  data,
}: {
  companyId: string;
  data: AdminCompanyDetail;
}) {
  const review = useReviewDocuments();
  // Başvurular kuyruğundan gelindiyse (?from=queue) karar sonrası kuyruğa
  // dönülür — inceleme temposu kesilmesin.
  const router = useRouter();
  const fromQueue = useSearchParams().get("from") === "queue";
  const [decisions, setDecisions] = useState<
    Partial<Record<DocKind, DocDecision>>
  >({});
  // Sayfa içi önizleme — açık olan belge (yeni sekmeye gitmeden inceleme).
  const [previewKey, setPreviewKey] = useState<DocKind | null>(null);

  const required = useMemo(() => requiredKinds(data.country), [data.country]);
  const foreign = (data.country ?? "TR").toUpperCase() !== "TR";

  // Mevcut belge durumlarını taslağa yükle (APPROVED/REJECTED ön-seçili).
  useEffect(() => {
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

  const setDecision = (k: DocKind, d: DocDecision | undefined) =>
    setDecisions((prev) => ({ ...prev, [k]: d }));

  const approveAll = () => {
    const next: Partial<Record<DocKind, DocDecision>> = {};
    for (const k of required) next[k] = { status: "APPROVED" };
    setDecisions((prev) => ({ ...prev, ...next }));
  };

  const save = () => {
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
          if (fromQueue) router.push("/admin/basvurular");
        },
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <div className="space-y-4">
      {/* Faz Y A-modeli: VERIFIED firmanın bekleyen belge güncellemeleri —
          tekil onay/red; ret'te eski belge geçerli kalır, firma VERIFIED kalır. */}
      {(data.pendingRevisions ?? []).length > 0 ? (
        <section className="admin-card px-5 py-4">
          <h3 className="text-admin-text text-sm font-semibold">
            Belge Güncellemeleri — onay bekliyor
          </h3>
          <p className="text-admin-text-muted mt-0.5 text-xs">
            Firma doğrulanmış durumda; onaylarsanız yeni belge geçerli olur,
            reddederseniz mevcut belge geçerliliğini korur.
          </p>
          <ul className="divide-admin-border border-admin-border mt-3 divide-y rounded-xl border">
            {data.pendingRevisions.map((rev) => (
              <RevisionRow key={rev.id} companyId={companyId} rev={rev} />
            ))}
          </ul>
        </section>
      ) : null}

      {foreign ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Yabancı firma ({data.country}) — zorunlu belge seti: Ticaret Sicil,
          Vergi Levhası muadili ve Yetkili Kimlik (Ön). Diğer belgeler
          istenmez.
        </div>
      ) : null}

      <section className="admin-card px-5 py-4">
        <div className="flex items-center justify-between">
          <h3 className="text-admin-text text-sm font-semibold">
            Belgeler — belge bazlı inceleme
          </h3>
          <button
            type="button"
            onClick={approveAll}
            className="text-xs font-medium text-blue-600 hover:underline"
          >
            Hepsini Onayla
          </button>
        </div>
        <ul className="divide-admin-border border-admin-border mt-3 divide-y rounded-xl border">
          {DOCS.filter((d) => required.includes(d.key)).map((d) => {
            const url = data[d.url] as string | null;
            const st = data[d.status] as DocStatus;
            const dec = decisions[d.key];
            return (
              <li key={d.key} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-admin-text flex items-center gap-2 text-sm">
                    <FileText className="text-admin-text-muted h-4 w-4" />
                    {d.label}
                    {url ? (
                      <Badge color={DOC_BADGE[st].color}>
                        {DOC_BADGE[st].label}
                      </Badge>
                    ) : (
                      <span className="text-admin-text-muted text-xs">Yüklenmedi</span>
                    )}
                  </span>
                  {url ? (
                    <span className="flex shrink-0 items-center gap-3">
                      <button
                        type="button"
                        onClick={() =>
                          setPreviewKey(previewKey === d.key ? null : d.key)
                        }
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        {previewKey === d.key ? "Önizlemeyi Kapat" : "Önizle"}
                      </button>
                      <a
                        href={url}
                        target="_blank"
                        rel="noreferrer"
                        className="text-xs font-semibold text-blue-600 hover:underline"
                      >
                        Görüntüle
                      </a>
                    </span>
                  ) : null}
                </div>
                {/* Sayfa içi önizleme — PDF/görsel iframe'de açılır. */}
                {url && previewKey === d.key ? (
                  <iframe
                    src={url}
                    title={`${d.label} önizleme`}
                    className="border-admin-border h-[480px] w-full rounded-lg border bg-white"
                  />
                ) : null}
                {url ? (
                  <div className="flex flex-col gap-2">
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setDecision(d.key, { status: "APPROVED" })}
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
                      <div className="flex flex-col gap-1.5">
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
                          className="border-admin-border bg-admin-surface text-admin-text w-full rounded-lg border px-3 py-1.5 text-xs"
                        />
                        {/* Hazır gerekçeler — tıkla doldur, gerekirse düzenle. */}
                        <div className="flex flex-wrap gap-1.5">
                          {REJECT_TEMPLATES.map((t) => (
                            <button
                              key={t}
                              type="button"
                              onClick={() =>
                                setDecision(d.key, {
                                  status: "REJECTED",
                                  reason: t,
                                })
                              }
                              className="border-admin-border text-admin-text-muted hover:bg-admin-border/30 rounded-full border px-2 py-0.5 text-[11px]"
                            >
                              {t}
                            </button>
                          ))}
                        </div>
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </li>
            );
          })}
        </ul>
        <div className="mt-4 flex justify-end">
          <Button onClick={save} loading={review.isPending}>
            Kararı Kaydet
          </Button>
        </div>
      </section>
    </div>
  );
}

/** Faz Y — tek bekleyen belge-güncelleme revizyonu satırı (onay/red + gerekçe). */
function RevisionRow({
  companyId,
  rev,
}: {
  companyId: string;
  rev: AdminCompanyDetail["pendingRevisions"][number];
}) {
  const decide = useReviewDocRevision();
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState("");
  const label = DOCS.find((d) => d.key === rev.kind)?.label ?? rev.kind;

  const submit = (status: "APPROVED" | "REJECTED") => {
    if (status === "REJECTED" && reason.trim().length < 3) {
      toast.error("Red gerekçesi girin");
      return;
    }
    decide.mutate(
      { id: companyId, revId: rev.id, status, reason: reason.trim() || undefined },
      {
        onSuccess: () =>
          toast.success(
            status === "APPROVED"
              ? `${label} güncellemesi onaylandı — yeni belge geçerli`
              : `${label} güncellemesi reddedildi — eski belge geçerli`,
          ),
        onError: (e: unknown) =>
          toast.error(e instanceof Error ? e.message : "Hata"),
      },
    );
  };

  return (
    <li className="flex flex-col gap-2 px-4 py-3">
      <div className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 items-center gap-2">
          <FileText className="text-admin-text-muted h-4 w-4 shrink-0" />
          <span className="text-admin-text text-sm font-medium">{label}</span>
          <Badge color="purple">Yeni belge</Badge>
        </div>
        <div className="flex items-center gap-2">
          {rev.url ? (
            <a
              href={rev.url}
              target="_blank"
              rel="noreferrer"
              className="text-xs font-medium text-blue-600 hover:underline"
            >
              Yeni Belgeyi Görüntüle
            </a>
          ) : null}
          <Button
            size="sm"
            onClick={() => submit("APPROVED")}
            loading={decide.isPending}
          >
            <Check className="h-3.5 w-3.5" /> Onayla
          </Button>
          <Button
            size="sm"
            variant="secondary"
            onClick={() => setRejecting((v) => !v)}
            disabled={decide.isPending}
          >
            <X className="h-3.5 w-3.5" /> Reddet
          </Button>
        </div>
      </div>
      {rejecting ? (
        <div className="flex flex-wrap items-center gap-2 pl-6">
          <input
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Red gerekçesi (firmaya iletilir)"
            className="border-admin-border min-w-64 flex-1 rounded-lg border px-2.5 py-1.5 text-xs"
          />
          {REJECT_TEMPLATES.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setReason(t)}
              className="text-admin-text-muted rounded-full bg-zinc-100 px-2 py-0.5 text-[11px] hover:bg-zinc-200"
            >
              {t}
            </button>
          ))}
          <Button
            size="sm"
            variant="secondary"
            onClick={() => submit("REJECTED")}
            loading={decide.isPending}
          >
            Reddi Onayla
          </Button>
        </div>
      ) : null}
    </li>
  );
}
