"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { ArrowRight } from "lucide-react";
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
}: Props) {
  const canContinue =
    draft.name.trim().length >= 2 && draft.name.trim().length <= 100;

  return (
    <div className="space-y-6">
      {/* Genel Bilgiler — onay yalnızca kazandırma içindir (madde 22) */}
      <section className="bg-white border border-slate-200 rounded-2xl p-6">
        <div className="mb-4">
          <h3 className="font-semibold text-base text-brand-900">
            Kazandırma Onayı
          </h3>
          <p className="text-xs text-slate-600 mt-1">
            Bu akış, bir ihalede kazanan belirlendiğinde devreye girer.
          </p>
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
