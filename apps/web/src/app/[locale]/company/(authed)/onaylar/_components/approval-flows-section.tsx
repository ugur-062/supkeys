"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { useMoneyInputError, useRoleLabel } from "@/i18n/domain";
import { INTL_LOCALE } from "@/i18n/format";
import { userHasPermission } from "@/lib/company/permissions";
import { Link } from "@/i18n/navigation";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  useApprovalFlows,
  useCreateApprovalFlow,
  useDeleteApprovalFlow,
  useDuplicateApprovalFlow,
  useSetApprovalFlowStatus,
  useUpdateApprovalFlow,
  type ApprovalFlow,
  type ApprovalListingType,
  type CreateApprovalFlowInput,
} from "@/hooks/use-company-approvals";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useCompanyUsers } from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import {
  ArrowDown,
  BadgeCheck,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronUp,
  Info,
  Pencil,
  Plus,
  ShieldCheck,
  Trash2,
  Trophy,
  Users2,
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

// Rol adları `useRoleLabel` (web.domain.role); kapsam etiketi katalogda
// `listingType.<KOD>`. Zengin metinlerin <strong> etiketi tek yerden.
const listingTypeKey = (lt: ApprovalListingType | null) =>
  lt === "ALIM" ? ("listingType.ALIM" as const) : ("listingType.all" as const);
const strong = (chunks: React.ReactNode) => <strong>{chunks}</strong>;

/** Eşik tutarı (₺) — okuyucunun dilinde, ondalıksız. */
function useFmtTl() {
  const locale = useLocale() as Locale;
  return useMemo(
    () =>
      new Intl.NumberFormat(INTL_LOCALE[locale] ?? "tr-TR", {
        maximumFractionDigits: 0,
      }),
    [locale],
  );
}

interface StepDraft {
  approverUserId: string;
  displayLabel: string;
  threshold: string; // "" = her zaman aktif
}

interface ApproverOption {
  id: string;
  name: string;
  roles: CompanyRole[];
}

/** Kavramları anlatan bilgi kutusu — kullanıcı "başlatıcı nedir" diye sormasın. */
function InfoNote({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex gap-3 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-sm text-blue-900">
      <Info className="mt-0.5 size-4 shrink-0 text-blue-500" aria-hidden />
      <div className="space-y-1 leading-relaxed">{children}</div>
    </div>
  );
}

// ═══════════════════════════════ Bölüm kökü ═══════════════════════════════

export function ApprovalFlowsSection({
  canManage,
  /** true ise yeni akış sihirbazı bir kez açılır (Onaylar'daki üst butondan). */
  openNew = false,
  /** Sihirbaz açıldıktan sonra intent'i sıfırlar (remount'ta tekrar açmasın). */
  onConsumeOpenNew,
}: {
  canManage: boolean;
  openNew?: boolean;
  onConsumeOpenNew?: () => void;
}) {
  const t = useTranslations("web.panel.approvals.approvalFlowsSection");
  const { data: flows, isLoading, isError, refetch } = useApprovalFlows();
  const { data: users } = useCompanyUsers();
  const [wizard, setWizard] = useState<ApprovalFlow | "new" | null>(null);

  // Dışarıdan (üst buton) "yeni" tetikleyicisi — yalnız intent geldiğinde açar,
  // sonra tüketir. Bu sayede sekmeye tekrar girince (remount) kendiliğinden
  // açılmaz; intent parent'ta false'a döner.
  useEffect(() => {
    if (openNew) {
      setWizard("new");
      onConsumeOpenNew?.();
    }
  }, [openNew, onConsumeOpenNew]);

  // Onaycı = AKTİF ve "Onaylama" (approval:act) izni taşıyan (backend de zorlar).
  const approvers: ApproverOption[] = useMemo(
    () =>
      (users ?? [])
        .filter(
          (u) =>
            u.isActive &&
            (u.isOwner || userHasPermission(u, "approval:act")),
        )
        .map((u) => ({
          id: u.id,
          name: `${u.firstName} ${u.lastName}`,
          roles: u.roles,
        })),
    [users],
  );

  if (!canManage) {
    return (
      <div className="card p-6">
        <p className="text-sm text-zinc-500">
          {t("onayAkislariniYalnizcaFirmaSahibi")}
        </p>
      </div>
    );
  }

  if (wizard) {
    return (
      <FlowWizard
        flow={wizard === "new" ? null : wizard}
        approvers={approvers}
        onClose={() => setWizard(null)}
      />
    );
  }

  return (
    <FlowList
      flows={flows}
      isLoading={isLoading}
      isError={isError}
      onRetry={() => refetch()}
      onNew={() => setWizard("new")}
      onEdit={(f) => setWizard(f)}
    />
  );
}

// ═══════════════════════════════ Liste görünümü ═══════════════════════════════

function FlowList({
  flows,
  isLoading,
  isError,
  onRetry,
  onNew,
  onEdit,
}: {
  flows: ApprovalFlow[] | undefined;
  isLoading: boolean;
  isError: boolean;
  onRetry: () => void;
  onNew: () => void;
  onEdit: (f: ApprovalFlow) => void;
}) {
  const t = useTranslations("web.panel.approvals.approvalFlowsSection");
  const roleLabel = useRoleLabel();
  const fmtTl = useFmtTl();
  const confirm = useConfirm();
  const setStatus = useSetApprovalFlowStatus();
  const remove = useDeleteApprovalFlow();
  const duplicate = useDuplicateApprovalFlow();

  const handleToggle = async (f: ApprovalFlow) => {
    const next = f.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    try {
      await setStatus.mutateAsync({ id: f.id, status: next });
      toast.success(
        next === "ACTIVE" ? t("akisAktiflestirildi") : t("akisPasifeAlindi"),
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, t("durumGuncellenemedi")));
    }
  };

  const handleDuplicate = async (f: ApprovalFlow) => {
    try {
      await duplicate.mutateAsync(f.id);
      toast.success(t("akisKopyalandiTaslak"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kopyalanamadi")));
    }
  };

  const handleDelete = async (f: ApprovalFlow) => {
    const ok = await confirm({
      title: t("onayAkisiSilinsinMi"),
      description: t("akisiKaliciOlarakSilinecek", { name: f.name }),
      confirmLabel: t("sil"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(f.id);
      toast.success(t("akisSilindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
    }
  };

  return (
    <div className="space-y-5">
      {/* Ne işe yarar? açıklaması */}
      <InfoNote>
        <p>{t.rich("onayAkisiAciklama", { strong })}</p>
        <p className="text-blue-800/90">
          {t("ornegin50000UstuKazandirmalar")}
        </p>
      </InfoNote>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          {t("tanimliAkislar")}
        </h3>
        {/* Boş durumda CTA boş durumun İÇİNDE (§9) — burada yinelenmez. */}
        {flows && flows.length > 0 ? (
          <Button onClick={onNew}>
            <Plus className="size-4" />
            {t("yeniOnayAkisi")}
          </Button>
        ) : null}
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
      ) : isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center"
        >
          <p className="text-sm font-medium text-rose-900">
            {t("onayAkislariYuklenemedi")}
          </p>
          <p className="mt-1 text-sm text-rose-700/80">
            {t("baglantiSorunuOlabilirLutfenYeniden")}
          </p>
          <Button className="mt-4" outline onClick={onRetry}>
            {t("yenidenDene")}
          </Button>
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center">
          <BadgeCheck className="mx-auto h-9 w-9 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            {t("henuzOnayAkisiYok")}
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            {t("akisTanimlanmadigiIcinTumKazandirmalar")}
          </p>
          <Button className="mt-4" onClick={onNew}>
            <Plus className="size-4" />
            {t("ilkAkisiOlustur")}
          </Button>
        </div>
      ) : (
        <div className="space-y-3">
          {flows.map((f) => (
            <div
              key={f.id}
              className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm"
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="text-base font-semibold text-zinc-900">
                      {f.name}
                    </span>
                    <Badge
                      color={
                        f.status === "ACTIVE"
                          ? "green"
                          : f.status === "PASSIVE"
                            ? "zinc"
                            : "amber"
                      }
                    >
                      {f.status === "ACTIVE"
                        ? t("aktif")
                        : f.status === "PASSIVE"
                          ? t("pasif")
                          : t("taslak")}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <Trophy className="size-3.5 text-zinc-400" />
                      {t("kazandirma")}
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span>{t(listingTypeKey(f.listingType))}</span>
                    <span className="text-zinc-300">·</span>
                    <span>
                      {t("baslatanListesi", {
                        roles: f.initiatorRoles.length
                          ? f.initiatorRoles.map((r) => roleLabel(r)).join(", ")
                          : t("herkes2"),
                      })}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    plain
                    onClick={() => handleToggle(f)}
                    disabled={setStatus.isPending}
                  >
                    {f.status === "ACTIVE" ? t("pasiflestir") : t("aktiflestir")}
                  </Button>
                  <Button plain onClick={() => onEdit(f)}>
                    <Pencil className="size-4" aria-hidden />
                    {t("duzenle")}
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDuplicate(f)}
                    disabled={duplicate.isPending}
                  >
                    {t("kopyala")}
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDelete(f)}
                    disabled={remove.isPending}
                    aria-label={t("akisiniSil", { name: f.name })}
                    title={t("sil")}
                  >
                    <Trash2 className="size-4 text-red-500" aria-hidden />
                  </Button>
                </div>
              </div>

              {/* Zincir önizleme — başlatandan son onaya */}
              <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-zinc-100 pt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  <Users2 className="size-3" />
                  {t("baslatan")}
                </span>
                {f.steps.map((s) => (
                  <span key={s.order} className="flex items-center gap-2">
                    <ArrowRightMini />
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700">
                      <span className="flex size-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-bold text-white">
                        {s.order}
                      </span>
                      {s.approverName}
                      {s.displayLabel ? (
                        <span className="text-zinc-500">· {s.displayLabel}</span>
                      ) : null}
                      {s.conditionMinAmount != null ? (
                        <span className="text-amber-600">
                          ≥{fmtTl.format(s.conditionMinAmount)}₺
                        </span>
                      ) : null}
                    </span>
                  </span>
                ))}
                <ArrowRightMini />
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-700">
                  <Check className="size-3" />
                  {t("siparisOlusur")}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function ArrowRightMini() {
  return (
    <span className="text-zinc-300" aria-hidden>
      →
    </span>
  );
}

// ═══════════════════════════════ 3 adımlı wizard ═══════════════════════════════

const WIZARD_STEPS = ["akisBilgileri", "onayAdimlari", "ozetKaydet"] as const;

function FlowWizard({
  flow,
  approvers,
  onClose,
}: {
  flow: ApprovalFlow | null;
  approvers: ApproverOption[];
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.approvals.approvalFlowsSection");
  const roleLabel = useRoleLabel();
  const fmtTl = useFmtTl();
  const create = useCreateApprovalFlow();
  const update = useUpdateApprovalFlow(flow?.id ?? "");
  const setStatus = useSetApprovalFlowStatus();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(flow?.name ?? "");
  // Kayıt tipi seçicisi kalktı; mevcut değer olduğu gibi geri yazılır.
  const listingType: ApprovalListingType | "" = flow?.listingType ?? "";
  const [initiatorRoles, setInitiatorRoles] = useState<CompanyRole[]>(
    flow?.initiatorRoles ?? [],
  );
  const [steps, setSteps] = useState<StepDraft[]>(
    flow?.steps.map((s) => ({
      approverUserId: s.approverUserId,
      displayLabel: s.displayLabel ?? "",
      threshold:
        s.conditionMinAmount != null ? String(s.conditionMinAmount) : "",
    })) ?? [],
  );
  const [editingStep, setEditingStep] = useState<number | "new" | null>(null);

  const busy = create.isPending || update.isPending || setStatus.isPending;

  const nameById = useMemo(
    () => new Map(approvers.map((a) => [a.id, a.name])),
    [approvers],
  );

  const toggleInitiator = (r: CompanyRole) =>
    setInitiatorRoles((prev) =>
      prev.includes(r) ? prev.filter((x) => x !== r) : [...prev, r],
    );

  const thresholdError = useMemo(() => {
    let prev = -1;
    for (const s of steps) {
      const min = s.threshold ? Number(s.threshold) : 0;
      if (min < prev) return true;
      prev = min;
    }
    return false;
  }, [steps]);

  const step1Valid = name.trim().length >= 2;
  const step2Valid = steps.length > 0 && !thresholdError;

  const buildInput = (): CreateApprovalFlowInput => ({
    name: name.trim(),
    type: "LISTING_AWARD", // yayın onayı kaldırıldı — yalnız kazandırma
    listingType: listingType || undefined,
    initiatorRoles: initiatorRoles.length ? initiatorRoles : undefined,
    steps: steps.map((s) => ({
      approverUserId: s.approverUserId,
      displayLabel: s.displayLabel.trim() || undefined,
      conditionMinAmount: s.threshold ? Number(s.threshold) : undefined,
    })),
  });

  const save = async (activate: boolean) => {
    try {
      let id = flow?.id;
      if (flow) {
        await update.mutateAsync(buildInput());
      } else {
        const res = (await create.mutateAsync(buildInput())) as { id: string };
        id = res.id;
      }
      if (activate && id) {
        await setStatus.mutateAsync({ id, status: "ACTIVE" });
        toast.success(t("akisKaydedildiVeAktiflestirildi"));
      } else {
        toast.success(
          flow ? t("akisGuncellendi") : t("akisTaslakOlarakKaydedildi"),
        );
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <div className="space-y-6">
      {/* Başlık + adım göstergesi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button plain onClick={onClose}>
            <ChevronLeft className="size-4" />
            {t("vazgec")}
          </Button>
          <h3 className="text-lg font-semibold text-zinc-950">
            {flow ? t("akisiDuzenle") : t("yeniOnayAkisi")}
          </h3>
        </div>
        <ol className="flex items-center gap-1">
          {WIZARD_STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1">
              {i > 0 ? <span className="h-px w-5 bg-zinc-200" /> : null}
              <button
                type="button"
                onClick={() => {
                  if (
                    i <= step ||
                    (i === 1 && step1Valid) ||
                    (i === 2 && step1Valid && step2Valid)
                  ) {
                    setStep(i);
                  }
                }}
                className={cn(
                  "flex items-center gap-2 rounded-full px-2.5 py-1 text-xs font-semibold transition",
                  i === step
                    ? "bg-zinc-900 text-white"
                    : i < step
                      ? "text-zinc-700"
                      : "text-zinc-500",
                )}
              >
                <span
                  className={cn(
                    "flex size-4 items-center justify-center rounded-full text-xs",
                    i < step
                      ? "bg-emerald-100 text-emerald-700"
                      : i === step
                        ? "bg-white/20"
                        : "bg-zinc-100",
                  )}
                >
                  {i < step ? <Check className="size-2.5" /> : i + 1}
                </span>
                <span className="hidden sm:inline">{t(label)}</span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Adım 1: Bilgiler ── */}
      {step === 0 ? (
        <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
          <div className="space-y-4">
            <Field>
              <Label>{t("akisAdi")}</Label>
              <Input
                autoFocus
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder={t("ornYuksekTutarliKazandirmaOnayi")}
              />
              <Text className="mt-1 text-xs text-zinc-500">
                {t("buAkisiListedeTaniyacaginizKisa")}
              </Text>
            </Field>
            {/* "Hangi ihalelerde geçerli?" seçicisi KALDIRILDI (2026-09-10):
                satış ilanı kalktı, iki seçenek de aynı şeyi (ALIM) söylüyordu.
                Kayıt tipi eski akışlarda ne ise o korunur, yeni akış tüm
                satın alma taleplerinde geçerli. */}
          </div>
          <InfoNote>
            <p className="flex items-center gap-2 font-semibold">
              <Trophy className="size-4 text-blue-500" />
              {t("buAkisNeZamanCalisir")}
            </p>
            <p>{t.rich("birSatinAlmaTalebindeKazananSecildiginde", { strong })}</p>
            <p className="text-blue-800/90">
              {t("talepYayinlamaOnayiYokturTaslaklar")}
            </p>
          </InfoNote>
        </div>
      ) : null}

      {/* ── Adım 2: Diagram + yardım ── */}
      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="mx-auto flex w-full max-w-lg flex-col items-center">
            {/* Başlatıcı kartı */}
            <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-100/70 p-4">
              <div className="flex items-center gap-2">
                <Users2 className="size-4 text-zinc-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                  {t("sureciBaslatanRoller")}
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                {t("buRollerdekiKisilerKazandirmaYaptiginda")}
              </p>
              <div className="mt-2.5 flex flex-wrap gap-2">
                {(["SATIN_ALMACI", "SATISCI", "YONETICI"] as CompanyRole[]).map(
                  (role) => {
                    const on = initiatorRoles.includes(role);
                    return (
                      <button
                        key={role}
                        type="button"
                        aria-pressed={on}
                        onClick={() => toggleInitiator(role)}
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-xs font-medium transition",
                          on
                            ? "border-zinc-900 bg-zinc-900 text-white"
                            : "border-zinc-200 bg-white text-zinc-600 hover:border-zinc-400",
                        )}
                      >
                        {roleLabel(role)}
                      </button>
                    );
                  },
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-500">
                {t.rich("hicbiriSecilmezseHerkesinKazandirmasi", { strong })}
              </p>
            </div>

            {/* Adım kartları */}
            {steps.map((s, i) => (
              <div key={i} className="flex w-full flex-col items-center">
                <ArrowDown className="my-2 size-4 text-zinc-300" />
                <div className="w-full rounded-2xl border border-zinc-200 bg-white p-4 shadow-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      {/* P2 (denetim §9 Stepper): çift sıra göstergesi
                          ("1" yuvarlağı + "1. ONAY") teke indi. */}
                      <div className="flex items-center gap-2">
                        <span className="flex size-5 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wide text-zinc-500">
                          {s.displayLabel || t("onayAdimi")}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                        {nameById.get(s.approverUserId) ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {s.threshold
                          ? t("veUstuKazandirmalardaDevreyeGirer", { amount: fmtTl.format(Number(s.threshold)) })
                          : t("herTutardaDevreyeGirer")}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      {/* P2 (denetim §9): onaycı sıralama — klavye-dostu
                          yukarı/aşağı taşıma (dnd yerine bilinçli buton). */}
                      <Button
                        plain
                        disabled={i === 0}
                        onClick={() =>
                          setSteps((cur) => {
                            const next = [...cur];
                            [next[i - 1], next[i]] = [next[i], next[i - 1]];
                            return next;
                          })
                        }
                        aria-label={t("onayciyiYukariTasi", { stepNumber: i + 1 })}
                        title={t("yukariTasi")}
                      >
                        <ChevronUp className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        plain
                        disabled={i === steps.length - 1}
                        onClick={() =>
                          setSteps((cur) => {
                            const next = [...cur];
                            [next[i], next[i + 1]] = [next[i + 1], next[i]];
                            return next;
                          })
                        }
                        aria-label={t("onayciyiAsagiTasi", { stepNumber: i + 1 })}
                        title={t("asagiTasi")}
                      >
                        <ChevronDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        plain
                        onClick={() => setEditingStep(i)}
                        aria-label={t("onayciyiDuzenle", { stepNumber: i + 1 })}
                        title={t("duzenle")}
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        plain
                        onClick={() =>
                          setSteps((cur) => cur.filter((_, idx) => idx !== i))
                        }
                        aria-label={t("onayciyiKaldir", { stepNumber: i + 1 })}
                        title={t("kaldir")}
                      >
                        <Trash2 className="size-3.5 text-red-500" aria-hidden />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Yeni adım — backend @ArrayMaxSize(10): en çok 10 onay adımı. */}
            <ArrowDown className="my-2 size-4 text-zinc-300" />
            <button
              type="button"
              disabled={steps.length >= 10}
              onClick={() => setEditingStep("new")}
              className="flex w-full items-center justify-center gap-2 rounded-2xl border border-dashed border-zinc-300 py-3.5 text-sm font-medium text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-800 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Plus className="size-4" />
              {steps.length >= 10 ? t("enFazla10OnayAdimi") : t("onayciEkle")}
            </button>

            {/* Bitiş */}
            <ArrowDown className="my-2 size-4 text-zinc-300" />
            <div className="inline-flex items-center gap-2 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <Check className="size-3.5" />
              {t("onaylarTamamSiparisOlusur")}
            </div>

            {thresholdError ? (
              <p className="mt-3 text-xs text-red-600">
                {t("butceEsikleriArtanSiradaOlmali")}
              </p>
            ) : null}
            {approvers.length === 0 ? (
              <p className="mt-3 text-center text-xs text-amber-600">
                {t("onayciOlabilecekAktifKullaniciYok")}
              </p>
            ) : null}
          </div>

          {/* Yardım paneli */}
          <div className="space-y-3">
            <InfoNote>
              <p className="flex items-center gap-2 font-semibold">
                <ShieldCheck className="size-4 text-blue-500" />
                {t("onayAdimiNedir")}
              </p>
              <p>{t.rich("herAdimBirOnaycidir", { strong })}</p>
            </InfoNote>
            <InfoNote>
              <p className="font-semibold">{t("butceEsigiNeIseYarar")}</p>
              <p>{t.rich("birAdimaEsikKoyarsaniz", { strong })}</p>
            </InfoNote>
            <InfoNote>
              <p className="font-semibold">{t("kimlerOnayciOlabilir")}</p>
              <p>{t.rich("yalnizcaKurucuYoneticiVeyaOnaylayici", { strong })}</p>
            </InfoNote>
          </div>
        </div>
      ) : null}

      {/* ── Adım 3: Özet ── */}
      {step === 2 ? (
        <div className="max-w-2xl space-y-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                {t("akisAdi")}
              </dt>
              <dd className="mt-0.5 font-semibold text-zinc-900">{name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                {t("kapsam")}
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {t("kazandirma2", { scope: t(listingTypeKey(listingType || null)) })}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                {t("baslatanRoller")}
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {initiatorRoles.length
                  ? initiatorRoles.map((r) => roleLabel(r)).join(", ")
                  : t("herkes")}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-500">
                {t("onayZinciriAdim", { length: steps.length })}
              </dt>
              <dd className="mt-1.5 space-y-1.5">
                {steps.map((s, i) => (
                  <div
                    key={i}
                    className="flex flex-wrap items-center gap-2 text-zinc-900"
                  >
                    <span className="flex size-5 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white">
                      {i + 1}
                    </span>
                    {nameById.get(s.approverUserId) ?? "—"}
                    {s.displayLabel ? (
                      <span className="text-xs text-zinc-500">
                        ({s.displayLabel})
                      </span>
                    ) : null}
                    <span className="text-xs text-zinc-500">
                      {s.threshold
                        ? t("esikVeUstu", { amount: fmtTl.format(Number(s.threshold)) })
                        : t("herTutar")}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-500">
            {t("kaydetVeAktiflestirDediginizdeAkis")}
          </p>
        </div>
      ) : null}

      {/* Alt navigasyon */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
        <Button
          plain
          onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
        >
          {step === 0 ? t("vazgec") : t("geri")}
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)} disabled={!step1Valid}>
            {t("devamOnayAdimlari")}
          </Button>
        ) : step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={!step2Valid}>
            {t("devamOzet")}
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button outline onClick={() => save(false)} disabled={busy}>
              {flow ? t("kaydet") : t("taslakKaydet")}
            </Button>
            <Button onClick={() => save(true)} disabled={busy}>
              {t("kaydetVeAktiflestir")}
            </Button>
          </div>
        )}
      </div>

      {editingStep !== null ? (
        <StepEditorDialog
          initial={editingStep === "new" ? null : steps[editingStep]!}
          approvers={approvers}
          stepNumber={
            (editingStep === "new" ? steps.length : editingStep) + 1
          }
          prevThreshold={(() => {
            const idx = editingStep === "new" ? steps.length : editingStep;
            const before = steps.slice(0, idx);
            return before.length
              ? Math.max(
                  ...before.map((s) => (s.threshold ? Number(s.threshold) : 0)),
                )
              : 0;
          })()}
          onSave={(draft) => {
            if (editingStep === "new") setSteps((cur) => [...cur, draft]);
            else
              setSteps((cur) =>
                cur.map((s, i) => (i === editingStep ? draft : s)),
              );
            setEditingStep(null);
          }}
          onClose={() => setEditingStep(null)}
        />
      ) : null}
    </div>
  );
}

// ═══════════════════════════════ Adım editörü ═══════════════════════════════

function StepEditorDialog({
  initial,
  approvers,
  stepNumber,
  prevThreshold,
  onSave,
  onClose,
}: {
  initial: StepDraft | null;
  approvers: ApproverOption[];
  stepNumber: number;
  prevThreshold: number;
  onSave: (draft: StepDraft) => void;
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.approvals.approvalFlowsSection");
  const moneyError = useMoneyInputError();
  const roleLabel = useRoleLabel();
  const fmtTl = useFmtTl();
  const { user } = useCompanyAuth();
  const [approverUserId, setApproverUserId] = useState(
    initial?.approverUserId ?? approvers[0]?.id ?? "",
  );
  // "Görünen etiket" alanı KALDIRILDI (2026-09-10, kullanıcı: "gerek yok");
  // eski kayıtlardaki etiket korunur (düzenlemede aynen geri yazılır).
  const displayLabel = initial?.displayLabel ?? "";
  const [threshold, setThreshold] = useState(initial?.threshold ?? "");

  // #9 / INV-APPR-1: kişi kendini onaycı seçebilir (engellenmez) ama görev
  // ayrılığı gereği kazandırmayı başlatan, kendi adımını onaylayamaz — sistem o
  // adımı başka uygun onaycıya devreder; yoksa kazandırma reddedilir. UYAR, engelleme.
  const isSelfApprover = !!approverUserId && approverUserId === user?.id;

  const thresholdNum = threshold ? Number(threshold) : 0;
  // Backend approval.dto conditionMinAmount: @Min(0) @Max(MAX_MONEY) + 2 ondalık.
  // min:0 çünkü eşik 0 (her tutar) geçerli.
  const thresholdMoneyErr =
    threshold !== "" ? moneyError(thresholdNum, { min: 0 }) : null;
  const thresholdOrderInvalid = threshold !== "" && thresholdNum < prevThreshold;
  const thresholdInvalid = !!thresholdMoneyErr || thresholdOrderInvalid;
  const valid = !!approverUserId && !thresholdInvalid;

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>
        {initial ? t("onayciyiDuzenle", { stepNumber: stepNumber }) : t("onayci", { stepNumber: stepNumber })}
      </DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>{t("onayci2")}</Label>
          {approvers.length === 0 ? (
            /* Keşfedilebilirlik: asıl kafa karışıklığı bu boş durumda oluşuyor —
               kural "sistem izin vermiyor" değil, "önce rol ver". */
            <div className="mt-1 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>
                {t.rich("onayciYokAyarlardanRolVerin", {
                  strong,
                  link: (chunks) => (
                    <Link href="/company/ayarlar/kullanicilar" className="font-semibold underline">
                      {chunks}
                    </Link>
                  ),
                })}
              </span>
            </div>
          ) : (
            <Select
              value={approverUserId}
              onChange={(e) => setApproverUserId(e.target.value)}
            >
              <option value="">{t("onayciSec")}</option>
              {approvers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.roles.map((r) => roleLabel(r)).join(", ")})
                </option>
              ))}
            </Select>
          )}
          <Text className="mt-1 text-xs text-zinc-500">
            {t.rich("buKisiSirasiGeldigindeKazandirmayi", {
              strong,
              link: (chunks) => (
                <Link href="/company/ayarlar/kullanicilar" className="underline hover:text-zinc-600">
                  {chunks}
                </Link>
              ),
            })}
          </Text>
          {isSelfApprover ? (
            <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>{t.rich("kendiniziOnayciSectiniz", { strong })}</span>
            </div>
          ) : null}
        </Field>
        <Field>
          <Label>{t("butceEsigiOpsiyonel")}</Label>
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder={t("bosHerTutardaOnaylar")}
          />
          {thresholdMoneyErr ? (
            <p className="mt-1 text-xs text-red-600">{thresholdMoneyErr}</p>
          ) : thresholdOrderInvalid ? (
            <p className="mt-1 text-xs text-red-600">
              {t("esikOncekiAdiminEsigindenKucuk", { amount: fmtTl.format(prevThreshold) })}
            </p>
          ) : (
            <Text className="mt-1 text-xs text-zinc-500">
              {t("kazandirmaTutariBuEsiginAltindaysa")}
            </Text>
          )}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button
          onClick={() => onSave({ approverUserId, displayLabel, threshold })}
          disabled={!valid}
        >
          {initial ? t("kaydet") : t("ekle")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
