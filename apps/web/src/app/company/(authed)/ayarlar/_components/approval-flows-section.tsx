"use client";

import Link from "next/link";
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
import { moneyInputError } from "@/lib/money-input";
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

const ROLE_LABEL: Record<CompanyRole, string> = {
  SAHIP: "Kurucu",
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

function listingTypeLabel(t: ApprovalListingType | null) {
  return t === "ALIM"
    ? "Alış ihaleleri"
    : t === "SATIS"
      ? "Satış ilanları"
      : "Tüm ihaleler";
}

const fmtTl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 0 });

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
    <div className="flex gap-2.5 rounded-xl border border-blue-100 bg-blue-50/70 p-3.5 text-sm text-blue-900">
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

  // Onaycı yalnızca AKTİF Yönetici/Onaylayıcı olabilir (backend de zorlar).
  const approvers: ApproverOption[] = useMemo(
    () =>
      (users ?? [])
        .filter(
          (u) =>
            u.isActive &&
            (u.roles.includes("SAHIP") ||
              u.roles.includes("YONETICI") ||
              u.roles.includes("ONAYLAYICI")),
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
      <div className="rounded-2xl border border-zinc-950/10 bg-white p-6">
        <p className="text-sm text-zinc-500">
          Onay akışlarını yalnızca firma sahibi ya da Yönetici rolündeki
          kullanıcılar yönetebilir.
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
  const confirm = useConfirm();
  const setStatus = useSetApprovalFlowStatus();
  const remove = useDeleteApprovalFlow();
  const duplicate = useDuplicateApprovalFlow();

  const handleToggle = async (f: ApprovalFlow) => {
    const next = f.status === "ACTIVE" ? "PASSIVE" : "ACTIVE";
    try {
      await setStatus.mutateAsync({ id: f.id, status: next });
      toast.success(
        next === "ACTIVE" ? "Akış aktifleştirildi" : "Akış pasife alındı",
      );
    } catch (err) {
      toast.error(extractErrorMessage(err, "Durum güncellenemedi"));
    }
  };

  const handleDuplicate = async (f: ApprovalFlow) => {
    try {
      await duplicate.mutateAsync(f.id);
      toast.success("Akış kopyalandı (taslak)");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kopyalanamadı"));
    }
  };

  const handleDelete = async (f: ApprovalFlow) => {
    const ok = await confirm({
      title: "Onay akışı silinsin mi?",
      description: `"${f.name}" akışı kalıcı olarak silinecek.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    try {
      await remove.mutateAsync(f.id);
      toast.success("Akış silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  return (
    <div className="space-y-5">
      {/* Ne işe yarar? açıklaması */}
      <InfoNote>
        <p>
          <strong>Onay akışı</strong>, bir ihalede kazanan belirlendiğinde
          (kazandırma) <strong>sipariş oluşmadan önce</strong> belirlediğiniz
          kişilerin sırayla onayından geçmesini sağlar.
        </p>
        <p className="text-blue-800/90">
          Örneğin: “50.000 ₺ üstü kazandırmalar önce Satınalma Müdürü sonra
          Genel Müdür onayından geçsin.” Akış yoksa kazandırma anında uygulanır.
        </p>
      </InfoNote>

      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-zinc-900">
          Tanımlı Akışlar
        </h3>
        <Button onClick={onNew}>
          <Plus className="size-4" />
          Yeni Onay Akışı
        </Button>
      </div>

      {isLoading ? (
        <div className="h-24 animate-pulse rounded-2xl bg-zinc-100" aria-hidden />
      ) : isError ? (
        <div
          role="alert"
          className="rounded-2xl border border-rose-200 bg-rose-50/60 p-8 text-center"
        >
          <p className="text-sm font-medium text-rose-900">
            Onay akışları yüklenemedi
          </p>
          <p className="mt-1 text-sm text-rose-700/80">
            Bağlantı sorunu olabilir. Lütfen yeniden deneyin.
          </p>
          <Button className="mt-4" outline onClick={onRetry}>
            Yeniden Dene
          </Button>
        </div>
      ) : !flows || flows.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-zinc-200 bg-white p-10 text-center">
          <BadgeCheck className="mx-auto h-9 w-9 text-zinc-300" />
          <p className="mt-3 text-sm font-medium text-zinc-700">
            Henüz onay akışı yok
          </p>
          <p className="mx-auto mt-1 max-w-md text-sm text-zinc-500">
            Akış tanımlanmadığı için tüm kazandırmalar anında uygulanıyor. Bir
            onay zinciri eklemek için yukarıdaki butonu kullanın.
          </p>
          <Button className="mt-4" onClick={onNew}>
            <Plus className="size-4" />
            İlk Akışı Oluştur
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
                        ? "Aktif"
                        : f.status === "PASSIVE"
                          ? "Pasif"
                          : "Taslak"}
                    </Badge>
                  </div>
                  <div className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-0.5 text-xs text-zinc-500">
                    <span className="inline-flex items-center gap-1">
                      <Trophy className="size-3.5 text-zinc-400" />
                      Kazandırma
                    </span>
                    <span className="text-zinc-300">·</span>
                    <span>{listingTypeLabel(f.listingType)}</span>
                    <span className="text-zinc-300">·</span>
                    <span>
                      Başlatan:{" "}
                      {f.initiatorRoles.length
                        ? f.initiatorRoles.map((r) => ROLE_LABEL[r]).join(", ")
                        : "herkes"}
                    </span>
                  </div>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    plain
                    onClick={() => handleToggle(f)}
                    disabled={setStatus.isPending}
                  >
                    {f.status === "ACTIVE" ? "Pasifleştir" : "Aktifleştir"}
                  </Button>
                  <Button plain onClick={() => onEdit(f)}>
                    <Pencil className="size-4" aria-hidden />
                    Düzenle
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDuplicate(f)}
                    disabled={duplicate.isPending}
                  >
                    Kopyala
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDelete(f)}
                    disabled={remove.isPending}
                    aria-label={`"${f.name}" akışını sil`}
                    title="Sil"
                  >
                    <Trash2 className="size-4 text-red-500" aria-hidden />
                  </Button>
                </div>
              </div>

              {/* Zincir önizleme — başlatandan son onaya */}
              <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-zinc-100 pt-3">
                <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-600">
                  <Users2 className="size-3" />
                  Başlatan
                </span>
                {f.steps.map((s) => (
                  <span key={s.order} className="flex items-center gap-1.5">
                    <ArrowRightMini />
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-white px-2.5 py-1 text-xs text-zinc-700">
                      <span className="flex size-4 items-center justify-center rounded-full bg-zinc-900 text-[9px] font-bold text-white">
                        {s.order}
                      </span>
                      {s.approverName}
                      {s.displayLabel ? (
                        <span className="text-zinc-400">· {s.displayLabel}</span>
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
                  Sipariş oluşur
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

const WIZARD_STEPS = ["Akış Bilgileri", "Onay Adımları", "Özet & Kaydet"];

function FlowWizard({
  flow,
  approvers,
  onClose,
}: {
  flow: ApprovalFlow | null;
  approvers: ApproverOption[];
  onClose: () => void;
}) {
  const create = useCreateApprovalFlow();
  const update = useUpdateApprovalFlow(flow?.id ?? "");
  const setStatus = useSetApprovalFlowStatus();

  const [step, setStep] = useState(0);
  const [name, setName] = useState(flow?.name ?? "");
  const [listingType, setListingType] = useState<ApprovalListingType | "">(
    flow?.listingType ?? "",
  );
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
        toast.success("Akış kaydedildi ve aktifleştirildi");
      } else {
        toast.success(
          flow ? "Akış güncellendi" : "Akış taslak olarak kaydedildi",
        );
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <div className="space-y-6">
      {/* Başlık + adım göstergesi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button plain onClick={onClose}>
            <ChevronLeft className="size-4" />
            Vazgeç
          </Button>
          <h3 className="text-lg font-semibold text-zinc-950">
            {flow ? "Akışı Düzenle" : "Yeni Onay Akışı"}
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
                  "flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-semibold transition",
                  i === step
                    ? "bg-zinc-900 text-white"
                    : i < step
                      ? "text-zinc-700"
                      : "text-zinc-400",
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
                <span className="hidden sm:inline">{label}</span>
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
              <Label>Akış adı</Label>
              <Input
                autoFocus
                value={name}
                maxLength={120}
                onChange={(e) => setName(e.target.value)}
                placeholder="Örn. Yüksek Tutarlı Kazandırma Onayı"
              />
              <Text className="mt-1 text-xs text-zinc-400">
                Bu akışı listede tanıyacağınız kısa bir ad.
              </Text>
            </Field>
            <Field>
              <Label>Hangi ihalelerde geçerli?</Label>
              <Select
                value={listingType}
                onChange={(e) =>
                  setListingType(e.target.value as ApprovalListingType | "")
                }
              >
                <option value="">Tüm ihaleler (alış + satış)</option>
                <option value="ALIM">Yalnız alış ihaleleri</option>
                <option value="SATIS">Yalnız satış ilanları</option>
              </Select>
              <Text className="mt-1 text-xs text-zinc-400">
                Onay yalnızca seçtiğiniz tipteki ihalelerin kazandırmasında
                devreye girer.
              </Text>
            </Field>
          </div>
          <InfoNote>
            <p className="flex items-center gap-1.5 font-semibold">
              <Trophy className="size-4 text-blue-500" />
              Bu akış ne zaman çalışır?
            </p>
            <p>
              Bir ihalede kazanan seçildiğinde (kazandırma) devreye girer.
              Belirlediğiniz onaycılar zinciri tamamlamadan{" "}
              <strong>sipariş oluşmaz</strong>.
            </p>
            <p className="text-blue-800/90">
              İlan yayınlama onayı yoktur — taslaklar her zaman doğrudan
              yayınlanır.
            </p>
          </InfoNote>
        </div>
      ) : null}

      {/* ── Adım 2: Diagram + yardım ── */}
      {step === 1 ? (
        <div className="grid gap-6 lg:grid-cols-[1.3fr_1fr]">
          <div className="mx-auto flex w-full max-w-lg flex-col items-center">
            {/* Başlatıcı kartı */}
            <div className="w-full rounded-2xl border border-zinc-200 bg-zinc-50/70 p-4">
              <div className="flex items-center gap-2">
                <Users2 className="size-4 text-zinc-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                  Süreci başlatan roller
                </span>
              </div>
              <p className="mt-1 text-xs text-zinc-500">
                Bu rollerdeki kişiler kazandırma yaptığında onay zinciri
                devreye girer.
              </p>
              <div className="mt-2.5 flex flex-wrap gap-1.5">
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
                        {ROLE_LABEL[role]}
                      </button>
                    );
                  },
                )}
              </div>
              <p className="mt-2 text-xs text-zinc-400">
                Hiçbiri seçilmezse <strong>herkesin</strong> kazandırması onaya
                düşer.
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
                          {s.displayLabel || "Onay Adımı"}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                        {nameById.get(s.approverUserId) ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {s.threshold
                          ? `${fmtTl.format(Number(s.threshold))} ₺ ve üstü kazandırmalarda devreye girer`
                          : "Her tutarda devreye girer"}
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
                        aria-label={`${i + 1}. onaycıyı yukarı taşı`}
                        title="Yukarı taşı"
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
                        aria-label={`${i + 1}. onaycıyı aşağı taşı`}
                        title="Aşağı taşı"
                      >
                        <ChevronDown className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        plain
                        onClick={() => setEditingStep(i)}
                        aria-label={`${i + 1}. onaycıyı düzenle`}
                        title="Düzenle"
                      >
                        <Pencil className="size-3.5" aria-hidden />
                      </Button>
                      <Button
                        plain
                        onClick={() =>
                          setSteps((cur) => cur.filter((_, idx) => idx !== i))
                        }
                        aria-label={`${i + 1}. onaycıyı kaldır`}
                        title="Kaldır"
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
              {steps.length >= 10 ? "En fazla 10 onay adımı" : "Onaycı Ekle"}
            </button>

            {/* Bitiş */}
            <ArrowDown className="my-2 size-4 text-zinc-300" />
            <div className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1.5 text-xs font-semibold text-emerald-700">
              <Check className="size-3.5" />
              Onaylar tamam → sipariş oluşur
            </div>

            {thresholdError ? (
              <p className="mt-3 text-xs text-red-600">
                Bütçe eşikleri artan sırada olmalı — her adımın eşiği bir
                öncekinden büyük ya da eşit olmalı.
              </p>
            ) : null}
            {approvers.length === 0 ? (
              <p className="mt-3 text-center text-xs text-amber-600">
                Onaycı olabilecek aktif kullanıcı yok — Ayarlar →
                Kullanıcılar&apos;dan bir kullanıcıya Onaylayıcı rolü verin.
              </p>
            ) : null}
          </div>

          {/* Yardım paneli */}
          <div className="space-y-3">
            <InfoNote>
              <p className="flex items-center gap-1.5 font-semibold">
                <ShieldCheck className="size-4 text-blue-500" />
                Onay adımı nedir?
              </p>
              <p>
                Her adım <strong>bir onaycıdır</strong>. Adımlar yukarıdan
                aşağıya SIRAYLA işler: ilk onaycı onaylamadan ikinciye geçilmez.
              </p>
            </InfoNote>
            <InfoNote>
              <p className="font-semibold">Bütçe eşiği ne işe yarar?</p>
              <p>
                Bir adıma eşik koyarsanız, kazandırma tutarı o eşiğin{" "}
                <strong>altındaysa o adım atlanır</strong>. Örn. yalnızca büyük
                tutarlar üst yöneticiye gitsin istiyorsanız kullanışlıdır.
              </p>
            </InfoNote>
            <InfoNote>
              <p className="font-semibold">Kimler onaycı olabilir?</p>
              <p>
                Yalnızca <strong>Kurucu, Yönetici veya Onaylayıcı</strong>{" "}
                rolündeki aktif kullanıcılar. Başka birini onaycı yapmak için
                Ayarlar → Kullanıcılar&apos;dan Onaylayıcı rolü verin.
              </p>
            </InfoNote>
          </div>
        </div>
      ) : null}

      {/* ── Adım 3: Özet ── */}
      {step === 2 ? (
        <div className="max-w-2xl space-y-4">
          <dl className="grid grid-cols-2 gap-x-8 gap-y-4 rounded-2xl border border-zinc-200 bg-white p-5 text-sm shadow-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Akış adı
              </dt>
              <dd className="mt-0.5 font-semibold text-zinc-900">{name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Kapsam
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                Kazandırma · {listingTypeLabel(listingType || null)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Başlatan roller
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {initiatorRoles.length
                  ? initiatorRoles.map((r) => ROLE_LABEL[r]).join(", ")
                  : "Herkes"}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Onay zinciri ({steps.length} adım)
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
                    <span className="text-xs text-zinc-400">
                      {s.threshold
                        ? `≥ ${fmtTl.format(Number(s.threshold))} ₺`
                        : "her tutar"}
                    </span>
                  </div>
                ))}
              </dd>
            </div>
          </dl>
          <p className="text-xs text-zinc-400">
            “Kaydet ve Aktifleştir” dediğinizde akış hemen çalışmaya başlar.
            Taslak kaydederseniz listede pasif durur, sonra aktifleştirirsiniz.
          </p>
        </div>
      ) : null}

      {/* Alt navigasyon */}
      <div className="flex items-center justify-between border-t border-zinc-100 pt-4">
        <Button
          plain
          onClick={() => (step === 0 ? onClose() : setStep(step - 1))}
        >
          {step === 0 ? "Vazgeç" : "Geri"}
        </Button>
        {step === 0 ? (
          <Button onClick={() => setStep(1)} disabled={!step1Valid}>
            Devam: Onay Adımları
          </Button>
        ) : step === 1 ? (
          <Button onClick={() => setStep(2)} disabled={!step2Valid}>
            Devam: Özet
          </Button>
        ) : (
          <div className="flex gap-2">
            <Button outline onClick={() => save(false)} disabled={busy}>
              {flow ? "Kaydet" : "Taslak Kaydet"}
            </Button>
            <Button onClick={() => save(true)} disabled={busy}>
              Kaydet ve Aktifleştir
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
  const { user } = useCompanyAuth();
  const [approverUserId, setApproverUserId] = useState(
    initial?.approverUserId ?? approvers[0]?.id ?? "",
  );
  const [displayLabel, setDisplayLabel] = useState(initial?.displayLabel ?? "");
  const [threshold, setThreshold] = useState(initial?.threshold ?? "");

  // #9 / INV-APPR-1: kişi kendini onaycı seçebilir (engellenmez) ama görev
  // ayrılığı gereği kazandırmayı başlatan, kendi adımını onaylayamaz — sistem o
  // adımı başka uygun onaycıya devreder; yoksa kazandırma reddedilir. UYAR, engelleme.
  const isSelfApprover = !!approverUserId && approverUserId === user?.id;

  const thresholdNum = threshold ? Number(threshold) : 0;
  // Backend approval.dto conditionMinAmount: @Min(0) @Max(MAX_MONEY) + 2 ondalık.
  // min:0 çünkü eşik 0 (her tutar) geçerli.
  const thresholdMoneyErr =
    threshold !== "" ? moneyInputError(thresholdNum, { min: 0 }) : null;
  const thresholdOrderInvalid = threshold !== "" && thresholdNum < prevThreshold;
  const thresholdInvalid = !!thresholdMoneyErr || thresholdOrderInvalid;
  const valid = !!approverUserId && !thresholdInvalid;

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>
        {initial ? `${stepNumber}. Onaycıyı Düzenle` : `${stepNumber}. Onaycı`}
      </DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Onaycı</Label>
          {approvers.length === 0 ? (
            /* Keşfedilebilirlik: asıl kafa karışıklığı bu boş durumda oluşuyor —
               kural "sistem izin vermiyor" değil, "önce rol ver". */
            <div className="mt-1 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>
                Onaycı olabilecek aktif kullanıcı yok.{" "}
                <Link
                  href="/company/ayarlar/kullanicilar"
                  className="font-semibold underline"
                >
                  Ayarlar → Kullanıcılar
                </Link>
                &apos;dan bir kullanıcıya <strong>Onaylayıcı</strong> rolü verin.
              </span>
            </div>
          ) : (
            <Select
              value={approverUserId}
              onChange={(e) => setApproverUserId(e.target.value)}
            >
              <option value="">— onaycı seç —</option>
              {approvers.map((u) => (
                <option key={u.id} value={u.id}>
                  {u.name} ({u.roles.map((r) => ROLE_LABEL[r]).join(", ")})
                </option>
              ))}
            </Select>
          )}
          <Text className="mt-1 text-xs text-zinc-400">
            Bu kişi, sırası geldiğinde kazandırmayı Onaylar sayfasından onaylar
            ya da reddeder. Yalnız <strong>Kurucu, Yönetici veya Onaylayıcı</strong>{" "}
            rolündeki aktif kullanıcılar listelenir; başka birini eklemek için{" "}
            <Link
              href="/company/ayarlar/kullanicilar"
              className="underline hover:text-zinc-600"
            >
              Ayarlar → Kullanıcılar
            </Link>
            &apos;dan Onaylayıcı rolü verin.
          </Text>
          {isSelfApprover ? (
            <div className="mt-2 flex gap-2 rounded-lg border border-amber-200 bg-amber-50 p-2.5 text-xs text-amber-800">
              <Info className="mt-0.5 size-3.5 shrink-0 text-amber-500" aria-hidden />
              <span>
                Kendinizi onaycı seçtiniz. Görev ayrılığı gereği, bu adım{" "}
                <strong>kazandırmayı sizin başlattığınız</strong> durumlarda
                başka bir onaylayıcıya atanır; uygun kimse yoksa kazandırma
                reddedilir.
              </span>
            </div>
          ) : null}
        </Field>
        <Field>
          <Label>Görünen etiket (opsiyonel)</Label>
          <Input
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            placeholder='Örn. "Satınalma Müdürü"'
            maxLength={80}
          />
          <Text className="mt-1 text-xs text-zinc-400">
            Onay ekranında kişinin yanında görünür — pozisyonu belli eder.
          </Text>
        </Field>
        <Field>
          <Label>Bütçe eşiği ₺ (opsiyonel)</Label>
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="Boş = her tutarda onaylar"
          />
          {thresholdMoneyErr ? (
            <p className="mt-1 text-xs text-red-600">{thresholdMoneyErr}</p>
          ) : thresholdOrderInvalid ? (
            <p className="mt-1 text-xs text-red-600">
              Eşik önceki adımın eşiğinden ({fmtTl.format(prevThreshold)} ₺)
              küçük olamaz.
            </p>
          ) : (
            <Text className="mt-1 text-xs text-zinc-400">
              Kazandırma tutarı bu eşiğin altındaysa bu onaycı atlanır.
            </Text>
          )}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          onClick={() => onSave({ approverUserId, displayLabel, threshold })}
          disabled={!valid}
        >
          {initial ? "Kaydet" : "Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
