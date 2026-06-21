"use client";

import { Button } from "@/components/ui/button";
import { formatAmountTR } from "@/lib/approval-flows/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import {
  ArrowLeft,
  ArrowRight,
  Edit,
  Flag,
  Plus,
  X,
} from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import { useState } from "react";
import type { FlowDraft, FlowStepDraft } from "../../_components/wizard-types";
import { InitiatorPickerModal } from "./initiator-picker-modal";
import { StepEditorModal } from "./step-editor-modal";

interface Props {
  draft: FlowDraft;
  setDraft: Dispatch<SetStateAction<FlowDraft>>;
  users: TenantUserListItem[];
  onBack: () => void;
  onNext: () => void;
}

export function Step2Steps({ draft, setDraft, users, onBack, onNext }: Props) {
  const [initiatorOpen, setInitiatorOpen] = useState(false);
  const [stepOpen, setStepOpen] = useState(false);
  const [editingIdx, setEditingIdx] = useState<number | null>(null);

  const eligibleInitiators = users.filter(
    (u) => u.isActive && u.role !== "APPROVER",
  );
  const eligibleApprovers = users.filter(
    (u) => u.isActive && u.role !== "BUYER",
  );

  const initiatorUserList = users.filter((u) =>
    draft.initiatorUserIds.includes(u.id),
  );

  const canContinue =
    draft.initiatorUserIds.length > 0 && draft.steps.length > 0;

  const handleSaveStep = (data: Omit<FlowStepDraft, "orderIndex">) => {
    if (editingIdx !== null) {
      setDraft((d) => {
        const next = [...d.steps];
        next[editingIdx] = {
          ...data,
          orderIndex: next[editingIdx].orderIndex,
        };
        return { ...d, steps: next };
      });
    } else {
      setDraft((d) => ({
        ...d,
        steps: [...d.steps, { ...data, orderIndex: d.steps.length + 1 }],
      }));
    }
    setStepOpen(false);
    setEditingIdx(null);
  };

  const handleRemoveStep = (idx: number) => {
    setDraft((d) => {
      const next = d.steps
        .filter((_, i) => i !== idx)
        .map((s, i) => ({ ...s, orderIndex: i + 1 }));
      return { ...d, steps: next };
    });
  };

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="font-semibold text-base text-brand-900 mb-1">
          Onay Adımları
        </h3>
        <p className="text-sm text-slate-600 mb-6">
          Kazandırmayı kimlerin yaptığında onay gerekeceğini ve sırayla
          onaylayacak kişileri tanımlayın. Her adım için bütçe eşiği
          belirleyebilirsiniz.
        </p>

        <div className="bg-slate-50 rounded-xl p-6 overflow-x-auto">
          <div className="flex items-stretch gap-4 min-w-max pb-2">
            {/* Kazandırmayı Yapan Kişiler */}
            <DiagramCard
              borderClass="border-zinc-300"
              corner={
                <div className="absolute -top-2.5 left-3 bg-zinc-500 text-white p-1 rounded">
                  <Flag className="h-3.5 w-3.5 fill-current" />
                </div>
              }
              title={`Kazandırmayı Yapan Kişiler (${initiatorUserList.length})`}
            >
              <div className="space-y-1.5 min-h-[44px]">
                {initiatorUserList.length === 0 ? (
                  <p className="text-xs text-slate-500 italic">
                    Henüz kişi seçilmedi
                  </p>
                ) : (
                  <>
                    {initiatorUserList.slice(0, 3).map((u) => (
                      <UserChip key={u.id} user={u} />
                    ))}
                    {initiatorUserList.length > 3 ? (
                      <p className="text-[11px] text-slate-500 pl-1">
                        +{initiatorUserList.length - 3} kişi daha
                      </p>
                    ) : null}
                  </>
                )}
              </div>
              <button
                type="button"
                onClick={() => setInitiatorOpen(true)}
                className="text-xs text-brand-700 hover:underline mt-3 inline-flex items-center gap-1"
              >
                <Edit className="h-3 w-3" />
                Düzenle / Ekle
              </button>
            </DiagramCard>

            {/* Step kartları */}
            {draft.steps.map((step, idx) => {
              const approver = users.find(
                (u) => u.id === step.approverUserId,
              );
              return (
                <div key={idx} className="flex items-center">
                  <ArrowRight className="h-5 w-5 text-slate-400 mx-2 flex-shrink-0" />
                  <DiagramCard
                    borderClass="border-purple-300"
                    corner={
                      <div className="absolute -top-2.5 left-3 bg-purple-500 text-white px-2 py-0.5 rounded text-[11px] font-bold">
                        ADIM {step.orderIndex}
                      </div>
                    }
                    title={step.displayLabel || `Adım ${step.orderIndex}`}
                    actions={
                      <button
                        type="button"
                        onClick={() => handleRemoveStep(idx)}
                        className="p-1 rounded hover:bg-danger-50 text-danger-600"
                        aria-label="Adımı sil"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    }
                  >
                    {approver ? (
                      <UserChip user={approver} />
                    ) : (
                      <p className="text-xs text-slate-500 italic">
                        Onaylayıcı seçilmedi
                      </p>
                    )}

                    {step.conditionMinAmount && step.conditionMinAmount > 0 ? (
                      <div className="mt-2 px-2 py-1.5 bg-warning-50 border border-warning-200 rounded text-xs">
                        <p className="font-semibold text-warning-900">Koşul</p>
                        <p className="text-warning-800">
                          {formatAmountTR(
                            step.conditionMinAmount,
                            step.conditionCurrency,
                          )}{" "}
                          ve üstü
                        </p>
                      </div>
                    ) : (
                      <p className="text-[11px] text-slate-500 italic mt-2">
                        Tüm tutarlar için aktif
                      </p>
                    )}

                    <button
                      type="button"
                      onClick={() => {
                        setEditingIdx(idx);
                        setStepOpen(true);
                      }}
                      className="text-xs text-brand-700 hover:underline mt-2 inline-flex items-center gap-1"
                    >
                      <Edit className="h-3 w-3" />
                      Düzenle
                    </button>
                  </DiagramCard>
                </div>
              );
            })}

            {/* Yeni adım ekle */}
            <div className="flex items-center">
              {draft.steps.length > 0 ? (
                <ArrowRight className="h-5 w-5 text-slate-400 mx-2 flex-shrink-0" />
              ) : (
                <div className="w-9" />
              )}
              <button
                type="button"
                onClick={() => {
                  setEditingIdx(null);
                  setStepOpen(true);
                }}
                className={cn(
                  "min-w-[200px] rounded-xl p-4 text-center transition-colors group",
                  "bg-white border-2 border-dashed border-slate-300 hover:border-brand-400 hover:bg-brand-50/30",
                )}
              >
                <Plus className="h-6 w-6 text-slate-400 group-hover:text-brand-600 mx-auto mb-1" />
                <p className="text-sm font-semibold text-slate-600 group-hover:text-brand-700">
                  Yeni Adım Ekle
                </p>
              </button>
            </div>
          </div>
        </div>

        {!canContinue ? (
          <p className="text-xs text-slate-500 mt-3">
            Devam etmek için en az 1 kişi (kazandırmayı yapan) ve 1 onay adımı
            eklemelisiniz.
          </p>
        ) : null}
      </section>

      <div className="flex items-center justify-between gap-2">
        <Button type="button" variant="secondary" onClick={onBack}>
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Button>
        <Button
          type="button"
          variant="primary"
          onClick={onNext}
          disabled={!canContinue}
        >
          Devam Et
          <ArrowRight className="h-4 w-4" />
        </Button>
      </div>

      <InitiatorPickerModal
        open={initiatorOpen}
        onClose={() => setInitiatorOpen(false)}
        users={eligibleInitiators}
        selectedIds={draft.initiatorUserIds}
        onSave={(ids) => {
          setDraft((d) => ({ ...d, initiatorUserIds: ids }));
          setInitiatorOpen(false);
        }}
      />

      <StepEditorModal
        open={stepOpen}
        onClose={() => {
          setStepOpen(false);
          setEditingIdx(null);
        }}
        users={eligibleApprovers}
        existingSteps={draft.steps}
        editingIndex={editingIdx}
        initialData={editingIdx !== null ? draft.steps[editingIdx] : null}
        onSave={handleSaveStep}
      />
    </div>
  );
}

function DiagramCard({
  children,
  title,
  borderClass,
  corner,
  actions,
}: {
  children: React.ReactNode;
  title: string;
  borderClass: string;
  corner?: React.ReactNode;
  actions?: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "relative bg-white border-2 rounded-xl p-4 min-w-[240px] max-w-[280px]",
        borderClass,
      )}
    >
      {corner}
      <div className="flex items-start justify-between gap-2 mt-1.5">
        <p className="font-bold text-brand-900 text-sm flex-1 truncate">
          {title}
        </p>
        {actions}
      </div>
      <div className="mt-2.5">{children}</div>
    </div>
  );
}

function UserChip({ user }: { user: TenantUserListItem }) {
  return (
    <div className="flex items-center gap-2 text-sm">
      <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-brand-700 flex-shrink-0">
        {(user.firstName?.[0] ?? "?").toUpperCase()}
        {(user.lastName?.[0] ?? "").toUpperCase()}
      </div>
      <span className="truncate text-brand-900">
        {user.firstName} {user.lastName}
      </span>
    </div>
  );
}
