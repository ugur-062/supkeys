"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { APPROVAL_FLOW_TYPE_OPTIONS } from "@/lib/approval-flows/labels";
import type { ApprovalFlowType } from "@/lib/approval-flows/types";
import { cn } from "@/lib/utils";
import { ArrowRight, Info } from "lucide-react";
import type { Dispatch, SetStateAction } from "react";
import type { FlowDraft } from "../../_components/wizard-types";

interface Props {
  draft: FlowDraft;
  setDraft: Dispatch<SetStateAction<FlowDraft>>;
  onCancel: () => void;
  onNext: () => void;
  isEdit?: boolean;
}

export function Step1FlowInfo({
  draft,
  setDraft,
  onCancel,
  onNext,
  isEdit,
}: Props) {
  const canContinue =
    draft.name.trim().length >= 2 && draft.name.trim().length <= 100;

  return (
    <div className="space-y-6">
      {/* Onay Türü Seçimi */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-2">
          <h3 className="font-display font-bold text-base text-brand-900">
            Onay Türü Seçimi
          </h3>
          <span className="text-danger-500">*</span>
        </div>
        <div className="rounded-lg bg-brand-50/40 border border-brand-100 p-3 flex gap-2 text-xs text-brand-800 mb-4">
          <Info className="h-4 w-4 flex-shrink-0 mt-0.5" />
          <span>
            Oluşturacağınız onay akışının hangi süreciniz için geçerli
            olacağını seçin. {isEdit ? "Tip sonradan değiştirilebilir, fakat aktif akış mantığı ile çakışırsa eski ACTIVE akış pasif olur." : ""}
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {APPROVAL_FLOW_TYPE_OPTIONS.map((opt) => {
            const checked =
              opt.available &&
              draft.type === (opt.value as ApprovalFlowType);
            return (
              <button
                key={opt.value}
                type="button"
                disabled={!opt.available}
                onClick={() => {
                  if (opt.available) {
                    setDraft((d) => ({
                      ...d,
                      type: opt.value as ApprovalFlowType,
                    }));
                  }
                }}
                className={cn(
                  "text-left p-4 rounded-xl border-2 transition",
                  opt.available
                    ? "cursor-pointer hover:border-brand-300"
                    : "cursor-not-allowed opacity-60",
                  checked
                    ? "border-brand-400 bg-brand-50/40 ring-2 ring-brand-100"
                    : "border-slate-200 bg-white",
                )}
              >
                <div className="flex items-start gap-3">
                  <span
                    className={cn(
                      "mt-1 h-5 w-5 rounded-full border-2 flex items-center justify-center flex-shrink-0 transition",
                      checked
                        ? "border-brand-600 bg-brand-600"
                        : "border-slate-300",
                    )}
                  >
                    {checked ? (
                      <span className="h-2 w-2 rounded-full bg-white" />
                    ) : null}
                  </span>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2 flex-wrap">
                      <p className="font-bold text-brand-900">{opt.label}</p>
                      {!opt.available ? (
                        <span className="text-[10px] uppercase tracking-wide font-bold text-warning-700 bg-warning-50 border border-warning-200 rounded px-1.5 py-0.5">
                          Yakında · V2
                        </span>
                      ) : null}
                    </div>
                    <p className="text-xs text-slate-600 mt-1">
                      {opt.description}
                    </p>
                  </div>
                </div>
              </button>
            );
          })}
        </div>
      </section>

      {/* Genel Bilgiler */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <h3 className="font-display font-bold text-base text-brand-900">
            Genel Bilgiler
          </h3>
        </div>

        <div className="space-y-4">
          <Field>
            <Label htmlFor="flow-name">
              Onay Akış Adı <span className="text-danger-500">*</span>
            </Label>
            <Input
              id="flow-name"
              value={draft.name}
              onChange={(e) =>
                setDraft((d) => ({ ...d, name: e.target.value }))
              }
              placeholder='Örn. "500K üstü ihale onayı"'
              maxLength={100}
            />
          </Field>

          <Field hint={`${draft.description.length} / 500 karakter`}>
            <Label htmlFor="flow-description">Açıklama (opsiyonel)</Label>
            <Textarea
              id="flow-description"
              value={draft.description}
              onChange={(e) =>
                setDraft((d) => ({ ...d, description: e.target.value }))
              }
              placeholder="Akış için kısa bir açıklama girin…"
              rows={3}
              maxLength={500}
            />
          </Field>
        </div>
      </section>

      <div className="flex items-center justify-end gap-2">
        <Button type="button" variant="ghost" onClick={onCancel}>
          Vazgeç
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
    </div>
  );
}
