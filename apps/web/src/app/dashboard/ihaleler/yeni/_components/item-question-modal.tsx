"use client";

import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useQuestionTemplate,
  useQuestionTemplates,
} from "@/hooks/use-templates";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  ChevronDown,
  HelpCircle,
  Info,
  LayoutTemplate,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useState } from "react";
import { useFieldArray, useFormContext } from "react-hook-form";

interface Props {
  open: boolean;
  onClose: () => void;
  index: number;
}

const ANSWER_TYPES: Array<{ value: string; label: string }> = [
  { value: "TEXT", label: "Metin" },
  { value: "NUMBER", label: "Sayı" },
  { value: "YES_NO", label: "Evet / Hayır" },
  { value: "DATE", label: "Tarih" },
];

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function ItemQuestionModal({ open, onClose, index }: Props) {
  const { control, register } = useFormContext<TenderFormData>();
  const { fields, append, remove } = useFieldArray({
    control,
    name: `items.${index}.questions`,
    keyName: "_rfkey",
  });

  // Şablon picker
  const [pickerOpen, setPickerOpen] = useState(false);
  const [tplId, setTplId] = useState<string | null>(null);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const templates = useQuestionTemplates();
  const tplDetail = useQuestionTemplate(pickerOpen ? tplId : null);

  const addBlank = () =>
    append({ id: newId(), text: "", answerType: "TEXT", required: true });

  const addSelectedFromTemplate = () => {
    if (!tplDetail.data) return;
    const toAdd = tplDetail.data.items.filter((q) => selected.has(q.id));
    for (const q of toAdd) {
      append({
        id: newId(),
        text: q.text.slice(0, 500),
        answerType: q.answerType,
        required: q.required,
      });
    }
    setSelected(new Set());
    setPickerOpen(false);
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && onClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-2xl bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[88vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3 shrink-0">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-xl bg-warning-100 flex items-center justify-center flex-shrink-0">
                <HelpCircle className="w-5 h-5 text-warning-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Kalem {index + 1} Soruları
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 mt-0.5">
                  Bu kaleme birden fazla teknik soru ekleyebilirsiniz.
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

          <div className="px-5 py-4 space-y-4 overflow-y-auto">
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 flex gap-2">
              <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
              <span>
                Tedarikçi bu kaleme teklif verirken zorunlu işaretli soruları
                cevaplamak zorundadır.
              </span>
            </div>

            {/* Şablondan ekle */}
            <div className="rounded-lg border border-surface-border overflow-hidden">
              <button
                type="button"
                onClick={() => setPickerOpen((o) => !o)}
                className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-brand-700 hover:bg-brand-50/50 transition-colors"
              >
                <span className="flex items-center gap-2">
                  <LayoutTemplate className="w-4 h-4" />
                  Şablondan Soru Ekle
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
                      Kayıtlı soru şablonunuz yok.
                    </p>
                  ) : (
                    <>
                      <select
                        value={tplId ?? ""}
                        onChange={(e) => {
                          setTplId(e.target.value || null);
                          setSelected(new Set());
                        }}
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
                        <>
                          <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                            {tplDetail.data.items.map((q) => (
                              <li key={q.id}>
                                <label className="flex items-start gap-2 px-2.5 py-2 rounded-md bg-white border border-surface-border cursor-pointer hover:border-brand-300">
                                  <input
                                    type="checkbox"
                                    className="mt-0.5"
                                    checked={selected.has(q.id)}
                                    onChange={(e) => {
                                      setSelected((prev) => {
                                        const next = new Set(prev);
                                        if (e.target.checked) next.add(q.id);
                                        else next.delete(q.id);
                                        return next;
                                      });
                                    }}
                                  />
                                  <span className="min-w-0">
                                    <span className="text-sm text-brand-900 block">
                                      {q.text}
                                    </span>
                                    <span className="text-[11px] text-slate-500">
                                      {ANSWER_TYPES.find(
                                        (a) => a.value === q.answerType,
                                      )?.label ?? q.answerType}
                                      {q.required ? " · Zorunlu" : ""}
                                    </span>
                                  </span>
                                </label>
                              </li>
                            ))}
                          </ul>
                          <Button
                            type="button"
                            variant="secondary"
                            size="sm"
                            onClick={addSelectedFromTemplate}
                            disabled={selected.size === 0}
                          >
                            <Plus className="w-4 h-4" />
                            Seçilenleri Ekle ({selected.size})
                          </Button>
                        </>
                      ) : null}
                    </>
                  )}
                </div>
              ) : null}
            </div>

            {/* Soru listesi */}
            {fields.length === 0 ? (
              <p className="text-sm text-slate-500 text-center py-4">
                Henüz soru yok. "Soru Ekle" ile başlayın veya şablondan seçin.
              </p>
            ) : (
              <div className="space-y-3">
                {fields.map((f, qi) => (
                  <div
                    key={f._rfkey}
                    className="rounded-lg border border-surface-border p-3 space-y-2.5"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <span className="text-xs font-semibold text-slate-500">
                        Soru {qi + 1}
                      </span>
                      <button
                        type="button"
                        onClick={() => remove(qi)}
                        aria-label="Soruyu kaldır"
                        className="text-danger-500 hover:text-danger-700"
                      >
                        <Trash2 className="w-4 h-4" />
                      </button>
                    </div>
                    <Input
                      placeholder="Örn. Garanti süresi nedir?"
                      maxLength={500}
                      {...register(`items.${index}.questions.${qi}.text`)}
                    />
                    <div className="flex items-center gap-3 flex-wrap">
                      <div className="flex items-center gap-2">
                        <Label
                          htmlFor={`q-type-${index}-${qi}`}
                          className="text-xs text-slate-500 mb-0"
                        >
                          Cevap tipi
                        </Label>
                        <select
                          id={`q-type-${index}-${qi}`}
                          className="px-2.5 py-1.5 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30"
                          {...register(
                            `items.${index}.questions.${qi}.answerType`,
                          )}
                        >
                          {ANSWER_TYPES.map((a) => (
                            <option key={a.value} value={a.value}>
                              {a.label}
                            </option>
                          ))}
                        </select>
                      </div>
                      <label className="flex items-center gap-1.5 text-sm text-slate-700 cursor-pointer">
                        <input
                          type="checkbox"
                          {...register(
                            `items.${index}.questions.${qi}.required`,
                          )}
                        />
                        Zorunlu
                      </label>
                    </div>
                  </div>
                ))}
              </div>
            )}

            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={addBlank}
            >
              <Plus className="w-4 h-4" />
              Soru Ekle
            </Button>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2 shrink-0">
            <Button type="button" variant="primary" onClick={onClose}>
              Tamam
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
