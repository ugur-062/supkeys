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
import { countryName } from "@/lib/country";
import { Check, FileText, X } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";
import {
  REJECT_REASONS,
  hasRejectReason,
  parseReason,
} from "../verification-reason";
import { toastApiError } from "@/lib/api";

// Belge türü → etiket + Company alanları (url/status/reason).
//
// İKİ ETİKET (2026-09-27): aynı kolon TR firmasında Türk belgesidir ("Vergi
// Levhası", "Ticaret Sicil Gazetesi"), yabancı firmada ülkenin karşılığıdır
// (kuruluş belgesi, vergi/KDV kaydı, pasaport). Yabancı etiketler web kataloğu
// `web.panel.settings.companyDocs.foreign.*` TR metinleriyle AYNI — admin ile
// firma aynı belgeye aynı adı versin.
const DOCS: {
  key: DocKind;
  label: string;
  foreignLabel: string;
  url: keyof AdminCompanyDetail;
  status: keyof AdminCompanyDetail;
  reason: keyof AdminCompanyDetail;
}[] = [
  { key: "taxPlate", label: "Vergi Levhası", foreignLabel: "Vergi / KDV Kayıt Belgesi (Tax / VAT Certificate)", url: "docTaxPlateUrl", status: "docTaxPlateStatus", reason: "docTaxPlateReason" },
  { key: "tradeRegistry", label: "Ticaret Sicil Gazetesi", foreignLabel: "Kuruluş / Sicil Belgesi (Certificate of Incorporation)", url: "docTradeRegistryUrl", status: "docTradeRegistryStatus", reason: "docTradeRegistryReason" },
  { key: "signatureCircular", label: "İmza Sirküleri", foreignLabel: "İmza Sirküleri (Signature Circular)", url: "docSignatureCircularUrl", status: "docSignatureCircularStatus", reason: "docSignatureCircularReason" },
  { key: "activityCert", label: "Faaliyet Belgesi", foreignLabel: "Faaliyet Belgesi (Certificate of Activity)", url: "docActivityCertUrl", status: "docActivityCertStatus", reason: "docActivityCertReason" },
  { key: "idFront", label: "Yetkili Kimlik (Ön)", foreignLabel: "Yetkili Kimliği veya Pasaportu (Authorized Signatory ID / Passport)", url: "docIdFrontUrl", status: "docIdFrontStatus", reason: "docIdFrontReason" },
  { key: "idBack", label: "Yetkili Kimlik (Arka)", foreignLabel: "Yetkili Kimliği — Arka (ID Back)", url: "docIdBackUrl", status: "docIdBackStatus", reason: "docIdBackReason" },
];

function docLabel(d: (typeof DOCS)[number], foreign: boolean): string {
  return foreign ? d.foreignLabel : d.label;
}

/** Red kararı gövdesi: kod ve/veya not (boş not gönderilmez). */
function rejectPayload(dec: DocDecision): Pick<DocDecision, "reasonCode" | "reason"> {
  const note = dec.reason?.trim() ?? "";
  return {
    ...(dec.reasonCode ? { reasonCode: dec.reasonCode } : {}),
    ...(note ? { reason: note } : {}),
  };
}

// Zorunlu belge seti API'den (`requiredDocs`, tek kaynak shared
// `requiredDocsForCountry`). Eski API yanıtı için yedek: TR 6, diğerleri 3.
const FOREIGN_REQUIRED: DocKind[] = ["tradeRegistry", "taxPlate", "idFront"];
function requiredKinds(data: Pick<AdminCompanyDetail, "country" | "requiredDocs">): DocKind[] {
  if (data.requiredDocs?.length) return data.requiredDocs;
  const all = DOCS.map((d) => d.key);
  return (data.country ?? "TR").toUpperCase() === "TR"
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

/**
 * Red gerekçesi seçici — KOD çipleri + isteğe bağlı not (2026-09-27).
 *
 * Eskiden hazır Türkçe cümle input'a dolup olduğu gibi saklanıyor ve firmanın
 * Doğrulama sayfasında basılıyordu → yabancı firma gerekçeyi okuyamıyordu.
 * Kod firmanın dilinde çevrilir; not firmaya olduğu gibi gider.
 */
function RejectReasonPicker({
  label,
  value,
  onChange,
}: {
  label: string;
  value: { reasonCode?: string | null; reason?: string };
  onChange: (next: { reasonCode: string | null; reason: string }) => void;
}) {
  const code = value.reasonCode ?? null;
  const note = value.reason ?? "";
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex flex-wrap gap-1.5" role="group" aria-label={`${label} red gerekçesi`}>
        {REJECT_REASONS.map((r) => (
          <button
            key={r.code}
            type="button"
            aria-pressed={code === r.code}
            onClick={() => onChange({ reasonCode: code === r.code ? null : r.code, reason: note })}
            className={`rounded-full border px-2 py-0.5 text-[11px] ${
              code === r.code
                ? "border-red-500 bg-red-50 font-medium text-red-700"
                : "border-admin-border text-admin-text-muted hover:bg-admin-border/30"
            }`}
          >
            {r.label}
          </button>
        ))}
      </div>
      <input
        value={note}
        onChange={(e) => onChange({ reasonCode: code, reason: e.target.value })}
        placeholder="İsteğe bağlı not — firmaya olduğu gibi gösterilir; firmanın diliyle yazın ya da boş bırakın"
        aria-label={`${label} red notu`}
        className="border-admin-border bg-admin-surface text-admin-text w-full rounded-lg border px-3 py-1.5 text-xs"
      />
    </div>
  );
}

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

  const required = useMemo(() => requiredKinds(data), [data]);
  const foreign = (data.country ?? "TR").toUpperCase() !== "TR";

  // Mevcut belge durumlarını taslağa yükle (APPROVED/REJECTED ön-seçili).
  // Saklanan gerekçe "[KOD] not" biçiminde → koda + nota ayrılır.
  useEffect(() => {
    const init: Partial<Record<DocKind, DocDecision>> = {};
    for (const d of DOCS) {
      const st = data[d.status] as DocStatus;
      if (st === "APPROVED") init[d.key] = { status: "APPROVED" };
      else if (st === "REJECTED") {
        const parsed = parseReason(data[d.reason] as string | null);
        init[d.key] = {
          status: "REJECTED",
          reasonCode: parsed.code,
          reason: parsed.note,
        };
      }
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
      const label = docLabel(meta, foreign);
      if (!data[meta.url]) {
        toast.error(`Eksik belge: ${label}`);
        return;
      }
      const dec = decisions[k];
      if (!dec) {
        toast.error(`Karar verilmemiş belge: ${label}`);
        return;
      }
      // Kod VEYA ≥3 karakterlik not (API `composeRejectReason` ile aynı).
      if (dec.status === "REJECTED" && !hasRejectReason(dec)) {
        toast.error(`Red gerekçesi seçin ya da not yazın: ${label}`);
        return;
      }
    }
    const payload: Partial<Record<DocKind, DocDecision>> = {};
    for (const k of required) {
      const dec = decisions[k]!;
      // #3: EKRANDA GÖRÜLEN nesnenin anahtarı karara iliştirilir — arada firma
      // belgeyi değiştirdiyse API 409 döner (görülmeyen belge onaylanmaz).
      const key = data.docKeys?.[k] ?? undefined;
      payload[k] =
        dec.status === "REJECTED"
          ? { status: "REJECTED", ...rejectPayload(dec), key }
          : { status: "APPROVED", key };
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
        onError: (e: unknown) => toastApiError(e),
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
              <RevisionRow key={rev.id} companyId={companyId} rev={rev} foreign={foreign} />
            ))}
          </ul>
        </section>
      ) : null}

      {foreign ? (
        <div className="rounded-xl border border-blue-200 bg-blue-50 px-4 py-3 text-sm text-blue-800">
          Yabancı firma ({countryName(data.country)}) — zorunlu belge seti:{" "}
          {DOCS.filter((d) => required.includes(d.key)).map((d) => d.foreignLabel).join(", ")}.
          Diğer belgeler istenmez.
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
            const label = docLabel(d, foreign);
            return (
              <li key={d.key} className="flex flex-col gap-2 px-4 py-3">
                <div className="flex items-center justify-between gap-3">
                  <span className="text-admin-text flex items-center gap-2 text-sm">
                    <FileText className="text-admin-text-muted h-4 w-4" />
                    {label}
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
                    title={`${label} önizleme`}
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
                            reasonCode: dec?.reasonCode ?? null,
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
                      <RejectReasonPicker
                        label={label}
                        value={dec}
                        onChange={(v) =>
                          setDecision(d.key, { status: "REJECTED", ...v })
                        }
                      />
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
  foreign,
}: {
  companyId: string;
  rev: AdminCompanyDetail["pendingRevisions"][number];
  foreign: boolean;
}) {
  const decide = useReviewDocRevision();
  const [rejecting, setRejecting] = useState(false);
  const [draft, setDraft] = useState<{ reasonCode: string | null; reason: string }>({
    reasonCode: null,
    reason: "",
  });
  const meta = DOCS.find((d) => d.key === rev.kind);
  const label = meta ? docLabel(meta, foreign) : rev.kind;

  const submit = (status: "APPROVED" | "REJECTED") => {
    if (status === "REJECTED" && !hasRejectReason(draft)) {
      toast.error("Red gerekçesi seçin ya da not yazın");
      return;
    }
    decide.mutate(
      {
        id: companyId,
        revId: rev.id,
        status,
        ...(status === "REJECTED"
          ? {
              reasonCode: draft.reasonCode ?? undefined,
              reason: draft.reason.trim() || undefined,
            }
          : {}),
      },
      {
        onSuccess: () =>
          toast.success(
            status === "APPROVED"
              ? `${label} güncellemesi onaylandı — yeni belge geçerli`
              : `${label} güncellemesi reddedildi — eski belge geçerli`,
          ),
        onError: (e: unknown) => toastApiError(e),
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
        <div className="flex flex-col gap-2 pl-6">
          <RejectReasonPicker label={label} value={draft} onChange={setDraft} />
          <div>
            <Button
              size="sm"
              variant="secondary"
              onClick={() => submit("REJECTED")}
              loading={decide.isPending}
            >
              Reddi Onayla
            </Button>
          </div>
        </div>
      ) : null}
    </li>
  );
}
