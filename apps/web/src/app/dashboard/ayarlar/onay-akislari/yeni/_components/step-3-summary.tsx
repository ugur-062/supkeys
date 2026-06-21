"use client";

import { Button } from "@/components/ui/button";
import {
  APPROVAL_FLOW_TYPE_META,
  formatAmountTR,
} from "@/lib/approval-flows/labels";
import type { TenantUserListItem } from "@/lib/users/types";
import { cn } from "@/lib/utils";
import { ArrowLeft, Info, Save, Send } from "lucide-react";
import type { FlowDraft } from "../../_components/wizard-types";

interface Props {
  draft: FlowDraft;
  users: TenantUserListItem[];
  onBack: () => void;
  onSaveDraft: () => void;
  onSaveActive: () => void;
  loading?: boolean;
  isEdit?: boolean;
}

export function Step3Summary({
  draft,
  users,
  onBack,
  onSaveDraft,
  onSaveActive,
  loading,
  isEdit,
}: Props) {
  const initiators = users.filter((u) =>
    draft.initiatorUserIds.includes(u.id),
  );
  const typeMeta = APPROVAL_FLOW_TYPE_META[draft.type];

  return (
    <div className="space-y-6">
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <h3 className="font-semibold text-base text-brand-900 mb-4">
          Onay Akışı Özeti
        </h3>

        <dl className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-6">
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Onay Türü
            </dt>
            <dd className="mt-1">
              <span
                className={cn(
                  "inline-flex items-center px-2 py-0.5 rounded-md text-xs font-semibold border",
                  typeMeta.pillClass,
                )}
              >
                {typeMeta.label}
              </span>
            </dd>
          </div>
          <div>
            <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
              Akış Adı
            </dt>
            <dd className="mt-1 font-semibold text-brand-900">
              {draft.name || "—"}
            </dd>
          </div>
          {draft.description ? (
            <div className="sm:col-span-2">
              <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
                Açıklama
              </dt>
              <dd className="mt-1 text-sm text-slate-700 whitespace-pre-line">
                {draft.description}
              </dd>
            </div>
          ) : null}
        </dl>

        <div className="border-t border-slate-200 pt-5">
          <h4 className="font-bold text-brand-900 text-sm mb-2">
            Kazandırmayı Yapan Kişiler ({initiators.length})
          </h4>
          <div className="flex flex-wrap gap-2">
            {initiators.length === 0 ? (
              <p className="text-xs text-slate-500 italic">Tanımlı yok</p>
            ) : (
              initiators.map((u) => (
                <span
                  key={u.id}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-zinc-50 text-zinc-700 border border-zinc-200 text-xs font-semibold"
                >
                  {u.firstName} {u.lastName}
                </span>
              ))
            )}
          </div>
        </div>

        <div className="border-t border-slate-200 pt-5 mt-5">
          <h4 className="font-bold text-brand-900 text-sm mb-3">
            Onay Adımları ({draft.steps.length})
          </h4>
          <ul className="space-y-2">
            {draft.steps.map((step) => {
              const approver = users.find(
                (u) => u.id === step.approverUserId,
              );
              return (
                <li
                  key={step.orderIndex}
                  className="flex items-center gap-3 p-3 bg-slate-50 rounded-lg"
                >
                  <div className="h-8 w-8 rounded-full bg-purple-100 text-purple-700 flex items-center justify-center font-bold flex-shrink-0">
                    {step.orderIndex}
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="font-semibold text-brand-900">
                      {step.displayLabel
                        ? `${step.displayLabel} — `
                        : `Adım ${step.orderIndex}: `}
                      {approver
                        ? `${approver.firstName} ${approver.lastName}`
                        : "Onaylayıcı yok"}
                    </p>
                    {step.conditionMinAmount &&
                    step.conditionMinAmount > 0 ? (
                      <p className="text-xs text-warning-700 mt-0.5">
                        Koşul:{" "}
                        {formatAmountTR(
                          step.conditionMinAmount,
                          step.conditionCurrency,
                        )}{" "}
                        ve üstü
                      </p>
                    ) : (
                      <p className="text-xs text-slate-500 italic mt-0.5">
                        Tüm tutarlar için aktif
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      </section>

      <div className="rounded-xl border border-brand-100 bg-brand-50/40 p-4 flex gap-3 items-start text-sm">
        <Info className="h-4 w-4 text-brand-600 flex-shrink-0 mt-0.5" />
        <div className="space-y-1">
          <p>
            <strong className="text-brand-900">Aktif kaydet:</strong> Akış
            hemen çalışmaya başlar. Aynı tipteki diğer aktif akışlar otomatik
            pasif olur.
          </p>
          <p>
            <strong className="text-brand-900">Taslak kaydet:</strong> Akış
            kaydedilir ama çalışmaz; sonradan aktif edebilirsiniz.
          </p>
        </div>
      </div>

      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Button
          type="button"
          variant="secondary"
          onClick={onBack}
          disabled={loading}
        >
          <ArrowLeft className="h-4 w-4" />
          Geri
        </Button>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="secondary"
            onClick={onSaveDraft}
            loading={loading}
            disabled={loading}
          >
            <Save className="h-4 w-4" />
            {isEdit ? "Taslak Olarak Kaydet" : "Taslak Kaydet"}
          </Button>
          <Button
            type="button"
            variant="primary"
            onClick={onSaveActive}
            loading={loading}
            disabled={loading}
            className="!bg-success-600 hover:!bg-success-700 focus:!ring-success-500"
          >
            <Send className="h-4 w-4" />
            Aktif Olarak Kaydet
          </Button>
        </div>
      </div>
    </div>
  );
}
