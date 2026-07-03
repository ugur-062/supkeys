"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
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
  type ApprovalType,
  type CreateApprovalFlowInput,
} from "@/hooks/use-company-approvals";
import { useCompanyUsers } from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  ArrowDown,
  BadgeCheck,
  Check,
  ChevronLeft,
  Pencil,
  Plus,
  Trash2,
  Users2,
} from "lucide-react";
import { useMemo, useState } from "react";
import { toast } from "sonner";

const TYPE_LABEL: Record<ApprovalType, string> = {
  LISTING_PUBLISH: "İlan Yayını",
  LISTING_AWARD: "Kazandırma",
};
const ROLE_LABEL: Record<CompanyRole, string> = {
  YONETICI: "Yönetici",
  SATIN_ALMACI: "Satın Almacı",
  SATISCI: "Satışçı",
  ONAYLAYICI: "Onaylayıcı",
};

function listingTypeLabel(t: ApprovalListingType | null) {
  return t === "ALIM" ? "Alım" : t === "SATIS" ? "Satış" : "Tüm ilanlar";
}

const fmtTl = new Intl.NumberFormat("tr-TR", { maximumFractionDigits: 2 });

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

// ═══════════════════════════════ Bölüm kökü ═══════════════════════════════

export function ApprovalFlowsSection({ canManage }: { canManage: boolean }) {
  const { data: flows, isLoading } = useApprovalFlows();
  const { data: users } = useCompanyUsers();
  const [wizard, setWizard] = useState<ApprovalFlow | "new" | null>(null);

  // Onaycı yalnızca AKTİF Yönetici/Onaylayıcı olabilir (backend de zorlar).
  const approvers: ApproverOption[] = useMemo(
    () =>
      (users ?? [])
        .filter(
          (u) =>
            u.isActive &&
            (u.roles.includes("YONETICI") || u.roles.includes("ONAYLAYICI")),
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
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>Onay Akışları</Subheading>
        <Text className="mt-2 text-sm text-zinc-500">
          Onay akışlarını yalnızca firma sahibi ya da Yönetici rolündeki
          kullanıcılar yönetebilir.
        </Text>
      </section>
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
      onNew={() => setWizard("new")}
      onEdit={(f) => setWizard(f)}
    />
  );
}

// ═══════════════════════════════ Liste görünümü ═══════════════════════════════

function FlowList({
  flows,
  isLoading,
  onNew,
  onEdit,
}: {
  flows: ApprovalFlow[] | undefined;
  isLoading: boolean;
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
      toast.success(next === "ACTIVE" ? "Akış aktifleştirildi" : "Akış pasife alındı");
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
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>Onay Akışları</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            İlan yayını ve kazandırma için çok-adımlı sıralı onay zinciri
            tanımlayın.
          </Text>
        </div>
        <Button onClick={onNew}>
          <Plus className="h-4 w-4" />
          Yeni Akış
        </Button>
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !flows || flows.length === 0 ? (
        <div className="mt-4 rounded-xl border border-dashed border-zinc-200 p-8 text-center">
          <BadgeCheck className="mx-auto h-8 w-8 text-zinc-300" />
          <p className="mt-2 text-sm font-medium text-zinc-600">
            Henüz onay akışı yok
          </p>
          <p className="mt-1 text-xs text-zinc-400">
            Akış olmadan ilanlar doğrudan yayınlanır ve kazandırma anında
            uygulanır.
          </p>
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {flows.map((f) => (
            <div
              key={f.id}
              className="rounded-xl border border-zinc-200 px-4 py-3"
            >
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">
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
                  <div className="mt-0.5 text-xs text-zinc-500">
                    {TYPE_LABEL[f.type]} · {listingTypeLabel(f.listingType)} ·
                    başlatıcı:{" "}
                    {f.initiatorRoles.length
                      ? f.initiatorRoles.map((r) => ROLE_LABEL[r]).join(", ")
                      : "herkes"}
                  </div>
                </div>
                <div className="flex items-center gap-1.5">
                  <Button plain onClick={() => handleToggle(f)}>
                    {f.status === "ACTIVE" ? "Pasifleştir" : "Aktifleştir"}
                  </Button>
                  <Button plain onClick={() => onEdit(f)}>
                    <Pencil className="h-4 w-4" />
                    Düzenle
                  </Button>
                  <Button
                    plain
                    onClick={() => handleDuplicate(f)}
                    disabled={duplicate.isPending}
                  >
                    Kopyala
                  </Button>
                  <Button plain onClick={() => handleDelete(f)}>
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </div>
              {/* Mini zincir önizleme */}
              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                {f.steps.map((s, i) => (
                  <span key={s.order} className="flex items-center gap-1.5">
                    {i > 0 ? (
                      <span className="text-zinc-300" aria-hidden>
                        →
                      </span>
                    ) : null}
                    <span className="inline-flex items-center gap-1 rounded-full border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] text-zinc-700">
                      <span className="font-semibold text-zinc-400">
                        {s.order}
                      </span>
                      {s.approverName}
                      {s.displayLabel ? (
                        <span className="text-zinc-400">
                          · {s.displayLabel}
                        </span>
                      ) : null}
                      {s.conditionMinAmount != null ? (
                        <span className="text-amber-600">
                          ≥{fmtTl.format(s.conditionMinAmount)}₺
                        </span>
                      ) : null}
                    </span>
                  </span>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
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
  const [type, setType] = useState<ApprovalType>(flow?.type ?? "LISTING_AWARD");
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

  // Eşikler artan sırada mı? (backend de zorlar; FE erken uyarır)
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
    type,
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
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      {/* Başlık + adım göstergesi */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Button plain onClick={onClose}>
            <ChevronLeft className="h-4 w-4" />
            Vazgeç
          </Button>
          <Subheading>
            {flow ? "Akışı Düzenle" : "Yeni Onay Akışı"}
          </Subheading>
        </div>
        <ol className="flex items-center gap-1">
          {WIZARD_STEPS.map((label, i) => (
            <li key={label} className="flex items-center gap-1">
              {i > 0 ? <span className="h-px w-5 bg-zinc-200" /> : null}
              <button
                type="button"
                onClick={() => {
                  // Geri her zaman; ileri yalnızca geçerliyse.
                  if (i <= step || (i === 1 && step1Valid) ||
                      (i === 2 && step1Valid && step2Valid)) {
                    setStep(i);
                  }
                }}
                className={`flex items-center gap-1.5 rounded-full px-2.5 py-1 text-[11px] font-semibold transition ${
                  i === step
                    ? "bg-zinc-900 text-white"
                    : i < step
                      ? "text-zinc-700"
                      : "text-zinc-400"
                }`}
              >
                <span
                  className={`flex h-4 w-4 items-center justify-center rounded-full text-[10px] ${
                    i < step
                      ? "bg-emerald-100 text-emerald-700"
                      : i === step
                        ? "bg-white/20"
                        : "bg-zinc-100"
                  }`}
                >
                  {i < step ? <Check className="h-2.5 w-2.5" /> : i + 1}
                </span>
                {label}
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Adım 1: Bilgiler ── */}
      {step === 0 ? (
        <div className="mt-5 max-w-xl space-y-4">
          <Field>
            <Label>Akış adı</Label>
            <Input
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Örn. Yüksek Tutarlı Kazandırma Onayı"
            />
          </Field>
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field>
              <Label>Onay tipi</Label>
              <Select
                value={type}
                onChange={(e) => setType(e.target.value as ApprovalType)}
              >
                <option value="LISTING_AWARD">Kazandırma</option>
                <option value="LISTING_PUBLISH">İlan Yayını</option>
              </Select>
            </Field>
            <Field>
              <Label>Uygulanacak ilan tipi</Label>
              <Select
                value={listingType}
                onChange={(e) =>
                  setListingType(e.target.value as ApprovalListingType | "")
                }
              >
                <option value="">Tüm ilanlar</option>
                <option value="ALIM">Alım</option>
                <option value="SATIS">Satış</option>
              </Select>
            </Field>
          </div>
          <p className="text-xs text-zinc-400">
            {type === "LISTING_AWARD"
              ? "Bu akış, bir ihalede kazanan belirlendiğinde devreye girer — onay tamamlanmadan sipariş oluşmaz."
              : "Bu akış, ilan yayınlanmak istendiğinde devreye girer — onay tamamlanmadan ilan yayına çıkmaz."}
          </p>
          <div className="flex justify-end">
            <Button onClick={() => setStep(1)} disabled={!step1Valid}>
              Devam: Onay Adımları
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Adım 2: Diagram ── */}
      {step === 1 ? (
        <div className="mt-5">
          <div className="mx-auto flex max-w-md flex-col items-center">
            {/* Başlatıcı kartı */}
            <div className="w-full rounded-xl border border-zinc-200 bg-zinc-50/70 p-4">
              <div className="flex items-center gap-2">
                <Users2 className="h-4 w-4 text-zinc-500" />
                <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                  Süreci Başlatanlar
                </span>
              </div>
              <div className="mt-2 flex flex-wrap gap-1.5">
                {(
                  [
                    "SATIN_ALMACI",
                    "SATISCI",
                    "YONETICI",
                  ] as CompanyRole[]
                ).map((role) => {
                  const on = initiatorRoles.includes(role);
                  return (
                    <button
                      key={role}
                      type="button"
                      onClick={() => toggleInitiator(role)}
                      className={`rounded-md border px-2.5 py-1 text-xs transition ${
                        on
                          ? "border-zinc-900 bg-zinc-900 text-white"
                          : "border-zinc-200 bg-white text-zinc-500 hover:border-zinc-400"
                      }`}
                    >
                      {ROLE_LABEL[role]}
                    </button>
                  );
                })}
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-400">
                Boş bırakılırsa herkes bu onayı tetikleyebilir. Onaylayıcı rolü
                süreç başlatamaz.
              </p>
            </div>

            {/* Adım kartları */}
            {steps.map((s, i) => (
              <div key={i} className="flex w-full flex-col items-center">
                <ArrowDown className="my-1.5 h-4 w-4 text-zinc-300" />
                <div className="w-full rounded-xl border border-zinc-200 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="flex h-5 w-5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
                          {i + 1}
                        </span>
                        <span className="text-xs font-bold uppercase tracking-wide text-zinc-700">
                          Adım {i + 1}
                          {s.displayLabel ? ` — ${s.displayLabel}` : ""}
                        </span>
                      </div>
                      <p className="mt-1.5 text-sm font-semibold text-zinc-900">
                        {nameById.get(s.approverUserId) ?? "—"}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-500">
                        {s.threshold
                          ? `${fmtTl.format(Number(s.threshold))} ₺ ve üstü tutarlarda devreye girer`
                          : "Tüm tutarlar için aktif"}
                      </p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <Button plain onClick={() => setEditingStep(i)}>
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        plain
                        onClick={() =>
                          setSteps((cur) => cur.filter((_, idx) => idx !== i))
                        }
                      >
                        <Trash2 className="h-3.5 w-3.5 text-red-500" />
                      </Button>
                    </div>
                  </div>
                </div>
              </div>
            ))}

            {/* Yeni adım */}
            <ArrowDown className="my-1.5 h-4 w-4 text-zinc-300" />
            <button
              type="button"
              onClick={() => setEditingStep("new")}
              className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-zinc-300 py-3 text-sm font-medium text-zinc-500 transition hover:border-zinc-500 hover:text-zinc-800"
            >
              <Plus className="h-4 w-4" />
              Yeni Adım Ekle
            </button>

            {thresholdError ? (
              <p className="mt-3 text-xs text-red-600">
                Bütçe eşikleri artan sırada olmalı — her adımın eşiği bir
                öncekinden büyük ya da eşit olmalı.
              </p>
            ) : null}
            {approvers.length === 0 ? (
              <p className="mt-3 text-xs text-amber-600">
                Onaycı olabilecek aktif Yönetici/Onaylayıcı bulunamadı — önce
                Kullanıcılar sayfasından ekleyin.
              </p>
            ) : null}
          </div>

          <div className="mt-5 flex justify-between">
            <Button plain onClick={() => setStep(0)}>
              Geri
            </Button>
            <Button onClick={() => setStep(2)} disabled={!step2Valid}>
              Devam: Özet
            </Button>
          </div>
        </div>
      ) : null}

      {/* ── Adım 3: Özet ── */}
      {step === 2 ? (
        <div className="mt-5 max-w-xl space-y-4">
          <dl className="grid grid-cols-2 gap-x-6 gap-y-3 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4 text-sm">
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Akış adı
              </dt>
              <dd className="mt-0.5 font-semibold text-zinc-900">{name}</dd>
            </div>
            <div>
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Onay tipi
              </dt>
              <dd className="mt-0.5 text-zinc-900">
                {TYPE_LABEL[type]} · {listingTypeLabel(listingType || null)}
              </dd>
            </div>
            <div className="col-span-2">
              <dt className="text-xs uppercase tracking-wide text-zinc-400">
                Başlatıcılar
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
              <dd className="mt-1.5 space-y-1">
                {steps.map((s, i) => (
                  <div key={i} className="flex items-center gap-2 text-zinc-900">
                    <span className="flex h-4.5 w-4.5 items-center justify-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">
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

          <div className="flex items-center justify-between">
            <Button plain onClick={() => setStep(1)}>
              Geri
            </Button>
            <div className="flex gap-2">
              <Button outline onClick={() => save(false)} disabled={busy}>
                {flow ? "Kaydet" : "Taslak Kaydet"}
              </Button>
              <Button onClick={() => save(true)} disabled={busy}>
                Kaydet ve Aktifleştir
              </Button>
            </div>
          </div>
        </div>
      ) : null}

      {editingStep !== null ? (
        <StepEditorDialog
          initial={editingStep === "new" ? null : steps[editingStep]!}
          approvers={approvers}
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
    </section>
  );
}

// ═══════════════════════════════ Adım editörü ═══════════════════════════════

function StepEditorDialog({
  initial,
  approvers,
  prevThreshold,
  onSave,
  onClose,
}: {
  initial: StepDraft | null;
  approvers: ApproverOption[];
  prevThreshold: number;
  onSave: (draft: StepDraft) => void;
  onClose: () => void;
}) {
  const [approverUserId, setApproverUserId] = useState(
    initial?.approverUserId ?? approvers[0]?.id ?? "",
  );
  const [displayLabel, setDisplayLabel] = useState(initial?.displayLabel ?? "");
  const [threshold, setThreshold] = useState(initial?.threshold ?? "");

  const thresholdNum = threshold ? Number(threshold) : 0;
  const thresholdInvalid = threshold !== "" && thresholdNum < prevThreshold;
  const valid = !!approverUserId && !thresholdInvalid;

  return (
    <Dialog open onClose={onClose} size="lg">
      <DialogTitle>{initial ? "Adımı Düzenle" : "Yeni Onay Adımı"}</DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Onaycı</Label>
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
          <Text className="mt-1 text-xs text-zinc-400">
            Yalnızca Yönetici ve Onaylayıcı rolündeki aktif kullanıcılar
            listelenir.
          </Text>
        </Field>
        <Field>
          <Label>Etiket (opsiyonel)</Label>
          <Input
            value={displayLabel}
            onChange={(e) => setDisplayLabel(e.target.value)}
            placeholder='Örn. "Satınalma Müdürü"'
            maxLength={80}
          />
        </Field>
        <Field>
          <Label>Bütçe eşiği ₺ (opsiyonel)</Label>
          <Input
            type="number"
            min={0}
            value={threshold}
            onChange={(e) => setThreshold(e.target.value)}
            placeholder="Boş = tüm tutarlarda aktif"
          />
          {thresholdInvalid ? (
            <p className="mt-1 text-xs text-red-600">
              Eşik önceki adımın eşiğinden ({fmtTl.format(prevThreshold)} ₺)
              küçük olamaz.
            </p>
          ) : (
            <Text className="mt-1 text-xs text-zinc-400">
              Tutar bu eşiğin altındaysa adım atlanır.
            </Text>
          )}
        </Field>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          onClick={() =>
            onSave({ approverUserId, displayLabel, threshold })
          }
          disabled={!valid}
        >
          {initial ? "Kaydet" : "Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
