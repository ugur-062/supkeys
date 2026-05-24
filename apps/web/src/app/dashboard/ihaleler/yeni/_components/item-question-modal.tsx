"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useQuestionTemplate,
  useQuestionTemplates,
} from "@/hooks/use-templates";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { ChevronDown, HelpCircle, Info, LayoutTemplate, X } from "lucide-react";
import { useState } from "react";
import { useFormContext, useWatch } from "react-hook-form";

const ANSWER_TYPE_TR: Record<string, string> = {
  TEXT: "Metin",
  NUMBER: "Sayı",
  YES_NO: "Evet/Hayır",
  DATE: "Tarih",
};

interface Props {
  open: boolean;
  onClose: () => void;
  index: number;
}

const MAX_QUESTION = 500;

export function ItemQuestionModal({ open, onClose, index }: Props) {
  const {
    register,
    setValue,
    control,
    formState: { errors },
  } = useFormContext<TenderFormData>();

  const value = useWatch({ control, name: `items.${index}.customQuestion` }) ?? "";
  const itemErrors = errors.items?.[index];

  // V2-7+ — Soru şablonundan seçim
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tplId, setTplId] = useState<string | null>(null);
  const templates = useQuestionTemplates();
  const tplDetail = useQuestionTemplate(pickerOpen ? tplId : null);

  const applyQuestion = (text: string) => {
    setValue(`items.${index}.customQuestion`, text.slice(0, MAX_QUESTION), {
      shouldDirty: true,
      shouldValidate: true,
    });
    setPickerOpen(false);
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-5 h-5 text-warning-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Kalem {index + 1} Sorusu
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Bu kaleme özel bir teknik soru sorabilirsiniz.
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                type="button"
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <div className="px-5 py-5 space-y-4">
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 flex gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Tedarikçi bu kaleme teklif verirken sorunuza cevap girmek
                zorunda kalır.
              </span>
            </div>

            {/* V2-7+ — Soru şablonundan seç */}
            <div className="rounded-lg border border-surface-border overflow-hidden">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" />
                  Şablondan Seç
                </span>
                <ChevronDown
                  className={cn(
                    "w-4 h-4 text-slate-400 transition-transform",
                    pickerOpen && "rotate-180",
                  )}
                />
              </button>
              {pickerOpen ? (
                <div className="px-3 py-3 border-t border-surface-border space-y-2.5 bg-slate-50/40">
                  {templates.isLoading ? (
                    <p className="text-xs text-slate-500">Yükleniyor…</p>
                  ) : (templates.data?.length ?? 0) === 0 ? (
                    <p className="text-xs text-slate-500">
                      Kayıtlı soru şablonunuz yok. Şablonlar → Kalem Sorusu'ndan
                      oluşturabilirsiniz.
                    </p>
                  ) : (
                    <>
                      <select
                        value={tplId ?? ""}
                        onChange={(e) => setTplId(e.target.value || null)}
                        className="w-full px-3 py-2 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                      >
                        <option value="">Şablon seçin…</option>
                        {templates.data?.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name} ({t.itemCount} soru)
                          </option>
                        ))}
                      </select>
                      {tplId && tplDetail.isLoading ? (
                        <p className="text-xs text-slate-500">
                          Sorular yükleniyor…
                        </p>
                      ) : tplDetail.data ? (
                        <ul className="space-y-1 max-h-48 overflow-y-auto pr-1">
                          {tplDetail.data.items.map((q) => (
                            <li key={q.id}>
                              <button
                                type="button"
                                onClick={() => applyQuestion(q.text)}
                                className="w-full text-left px-2.5 py-2 rounded-md bg-white border border-surface-border hover:border-brand-300 hover:bg-brand-50/40 transition-colors"
                              >
                                <span className="text-sm text-brand-900 block">
                                  {q.text}
                                </span>
                                <span className="text-[11px] text-slate-500">
                                  {ANSWER_TYPE_TR[q.answerType] ?? q.answerType}
                                  {q.required ? " · Zorunlu" : ""}
                                </span>
                              </button>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            <Field
              error={itemErrors?.customQuestion?.message}
              hint={`${value.length} / ${MAX_QUESTION} karakter`}
            >
              <Label htmlFor={`question-${index}`}>Soru</Label>
              <Textarea
                id={`question-${index}`}
                rows={4}
                maxLength={MAX_QUESTION}
                autoFocus
                placeholder="Örn. Garanti süresi nedir? Üretim yılı? Menşei?"
                hasError={!!itemErrors?.customQuestion}
                {...register(`items.${index}.customQuestion`)}
              />
            </Field>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-between gap-2">
            {value.trim() ? (
              <button
                type="button"
                onClick={() => {
                  setValue(`items.${index}.customQuestion`, "", {
                    shouldDirty: true,
                  });
                  onClose();
                }}
                className="text-xs text-danger-600 hover:text-danger-700 font-semibold"
              >
                Soruyu Kaldır
              </button>
            ) : (
              <span />
            )}
            <div className="flex items-center gap-2">
              <Button type="button" variant="ghost" onClick={onClose}>
                Vazgeç
              </Button>
              <Button type="button" variant="primary" onClick={onClose}>
                Kaydet
              </Button>
            </div>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
