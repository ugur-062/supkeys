"use client";

// V2-7+ — Kalem Sorusu Şablonu Oluştur / Düzenle / Görüntüle modal'ı.
// templateId verilirse düzenle/görüntüle modunda açılır (detay ön-doldurulur).
// Sahibi değilse salt-okunur (alanlar disabled, backend zaten düzenlemeyi engeller).

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useCreateQuestionTemplate,
  useQuestionTemplate,
  useUpdateQuestionTemplate,
  type QuestionTemplatePayload,
} from "@/hooks/use-templates";
import { extractErrorMessage } from "@/lib/tenders/error";
import type { QuestionAnswerType } from "@/lib/templates/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import {
  CheckCircle2,
  ListChecks,
  Lock,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  /** Verilirse düzenle/görüntüle modu; yoksa yeni oluşturma. */
  templateId?: string | null;
}

type RowState = {
  text: string;
  required: "REQUIRED" | "OPTIONAL" | "";
  answerType: QuestionAnswerType | "";
};

const ANSWER_TYPE_OPTIONS: Array<{ value: QuestionAnswerType; label: string }> = [
  { value: "TEXT", label: "Metin" },
  { value: "NUMBER", label: "Sayı" },
  { value: "YES_NO", label: "Evet / Hayır" },
  { value: "DATE", label: "Tarih" },
];

function emptyRow(): RowState {
  return { text: "", required: "", answerType: "" };
}

export function QuestionTemplateCreateDialog({
  open,
  onClose,
  templateId,
}: Props) {
  const isEditMode = !!templateId;
  const [name, setName] = useState("");
  const [isPublic, setIsPublic] = useState(true);
  const [autoApply, setAutoApply] = useState(false);
  const [rows, setRows] = useState<RowState[]>([emptyRow()]);

  const createMutation = useCreateQuestionTemplate();
  const updateMutation = useUpdateQuestionTemplate();
  const detail = useQuestionTemplate(open && isEditMode ? templateId : null);

  // Sahibi değilse salt-okunur (yeni oluştururken her zaman düzenlenebilir).
  const readOnly = isEditMode && detail.data ? !detail.data.isOwnedByMe : false;
  const mutation = isEditMode ? updateMutation : createMutation;

  // Düzenleme modunda detay gelince formu ön-doldur.
  useEffect(() => {
    if (!open || !isEditMode || !detail.data) return;
    const d = detail.data;
    setName(d.name);
    setIsPublic(d.isPublic);
    setAutoApply(d.autoApply);
    setRows(
      d.items.length > 0
        ? d.items.map((it) => ({
            text: it.text,
            required: it.required ? "REQUIRED" : "OPTIONAL",
            answerType: it.answerType,
          }))
        : [emptyRow()],
    );
  }, [open, isEditMode, detail.data]);

  const reset = () => {
    setName("");
    setIsPublic(true);
    setAutoApply(false);
    setRows([emptyRow()]);
  };

  const handleClose = () => {
    if (mutation.isPending) return;
    reset();
    onClose();
  };

  const updateRow = (idx: number, patch: Partial<RowState>) => {
    setRows((prev) => prev.map((r, i) => (i === idx ? { ...r, ...patch } : r)));
  };

  const removeRow = (idx: number) => {
    setRows((prev) =>
      prev.length > 1 ? prev.filter((_, i) => i !== idx) : prev,
    );
  };

  const canSubmit =
    !readOnly &&
    name.trim().length >= 2 &&
    rows.length > 0 &&
    rows.every(
      (r) =>
        r.text.trim().length > 0 && r.required !== "" && r.answerType !== "",
    );

  const handleSubmit = async () => {
    if (!canSubmit) return;
    const payload: QuestionTemplatePayload = {
      name: name.trim(),
      isPublic,
      autoApply,
      items: rows.map((r) => ({
        text: r.text.trim(),
        required: r.required === "REQUIRED",
        answerType: r.answerType as QuestionAnswerType,
      })),
    };
    try {
      if (isEditMode && templateId) {
        await updateMutation.mutateAsync({ id: templateId, payload });
        toast.success("Şablon güncellendi");
      } else {
        await createMutation.mutateAsync(payload);
        toast.success("Şablon oluşturuldu");
      }
      reset();
      onClose();
    } catch (err) {
      toast.error(
        extractErrorMessage(err, isEditMode ? "Güncellenemedi" : "Oluşturulamadı"),
      );
    }
  };

  const title = isEditMode
    ? readOnly
      ? "Kalem Sorusu Şablonu"
      : "Kalem Sorusu Şablonu Düzenle"
    : "Kalem Sorusu Şablonu Oluştur";

  const loadingDetail = isEditMode && detail.isLoading;

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-3xl bg-white rounded-2xl shadow-2xl outline-none",
            "max-h-[90vh] flex flex-col",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <ListChecks className="w-5 h-5 text-brand-600" />
              </div>
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                {title}
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={mutation.isPending}
              aria-label="Kapat"
              className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="flex-1 overflow-y-auto px-5 py-5 space-y-6">
            {loadingDetail ? (
              <p className="text-sm text-slate-500 text-center py-8">
                Yükleniyor…
              </p>
            ) : (
              <>
                {readOnly ? (
                  <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-slate-50 border border-surface-border text-sm text-slate-600">
                    <Lock className="w-4 h-4 shrink-0" />
                    Bu şablonu yalnızca oluşturan kişi düzenleyebilir. Görüntüleme
                    modundasınız.
                  </div>
                ) : null}

                {/* STEP 1 — İsim + Erişim */}
                <section>
                  <div className="flex items-center gap-2 mb-3">
                    <CheckCircle2 className="w-5 h-5 text-brand-600" />
                    <h3 className="font-semibold text-brand-900">
                      Şablon adını belirleyiniz
                    </h3>
                  </div>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                    <div className="md:col-span-2">
                      <Field>
                        <Label htmlFor="tpl-name" required>
                          Şablon Adı
                        </Label>
                        <Input
                          id="tpl-name"
                          placeholder="Ör. IT Sarf Malzeme"
                          value={name}
                          onChange={(e) => setName(e.target.value)}
                          maxLength={120}
                          disabled={readOnly}
                        />
                      </Field>
                    </div>
                    <Field>
                      <Label>Şablon Erişimi</Label>
                      <div className="flex items-center gap-4 px-3 py-2.5 rounded-lg border border-surface-border bg-white text-sm">
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={isPublic}
                            onChange={() => setIsPublic(true)}
                            disabled={readOnly}
                          />
                          Herkese Açık
                        </label>
                        <label className="flex items-center gap-1.5 cursor-pointer">
                          <input
                            type="radio"
                            checked={!isPublic}
                            onChange={() => setIsPublic(false)}
                            disabled={readOnly}
                          />
                          Özel
                        </label>
                      </div>
                    </Field>
                  </div>
                  <label className="flex items-start gap-2 mt-3 cursor-pointer">
                    <input
                      type="checkbox"
                      className="mt-0.5"
                      checked={autoApply}
                      onChange={(e) => setAutoApply(e.target.checked)}
                      disabled={readOnly}
                    />
                    <span className="text-sm text-slate-700">
                      Bu şablondaki soruların tamamı ihalelere otomatik olarak
                      eklensin.
                    </span>
                  </label>
                </section>

                {/* STEP 2 — Sorular */}
                <section>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="w-6 h-6 rounded-full bg-brand-100 text-brand-700 text-xs font-bold flex items-center justify-center">
                      2
                    </span>
                    <h3 className="font-semibold text-brand-900">
                      Kalem sorularınızı belirleyiniz
                    </h3>
                  </div>
                  <p className="text-xs text-slate-500 ml-8 mb-3">
                    Bu alanda tedarikçilerin cevaplamalarını istediğiniz özel
                    soruları dilediğiniz kadar oluşturabilirsiniz.
                  </p>

                  <div className="space-y-2">
                    {rows.map((r, idx) => (
                      <div
                        key={idx}
                        className="grid grid-cols-12 gap-2 items-start"
                      >
                        <div className="col-span-1 pt-3 text-center text-sm text-slate-500 font-mono">
                          {idx + 1}
                        </div>
                        <div className="col-span-5">
                          <Input
                            placeholder="Kalem Sorusu *"
                            value={r.text}
                            onChange={(e) =>
                              updateRow(idx, { text: e.target.value })
                            }
                            maxLength={500}
                            disabled={readOnly}
                          />
                        </div>
                        <div className="col-span-3">
                          <select
                            value={r.required}
                            onChange={(e) =>
                              updateRow(idx, {
                                required: e.target
                                  .value as RowState["required"],
                              })
                            }
                            disabled={readOnly}
                            className="w-full px-3 py-2.5 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            <option value="">Cevaplama Zorunluluğu *</option>
                            <option value="REQUIRED">Zorunlu</option>
                            <option value="OPTIONAL">İsteğe bağlı</option>
                          </select>
                        </div>
                        <div className="col-span-2">
                          <select
                            value={r.answerType}
                            onChange={(e) =>
                              updateRow(idx, {
                                answerType: e.target
                                  .value as RowState["answerType"],
                              })
                            }
                            disabled={readOnly}
                            className="w-full px-3 py-2.5 rounded-lg border border-surface-border bg-white text-sm focus:outline-none focus:ring-2 focus:ring-brand-500/30 focus:border-brand-500 disabled:bg-slate-50 disabled:text-slate-500"
                          >
                            <option value="">Cevap Türü *</option>
                            {ANSWER_TYPE_OPTIONS.map((o) => (
                              <option key={o.value} value={o.value}>
                                {o.label}
                              </option>
                            ))}
                          </select>
                        </div>
                        <div className="col-span-1 pt-1.5 text-right">
                          {!readOnly && rows.length > 1 ? (
                            <button
                              type="button"
                              onClick={() => removeRow(idx)}
                              className="text-slate-400 hover:text-danger-600 p-1.5"
                              title="Bu soruyu kaldır"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          ) : null}
                        </div>
                      </div>
                    ))}
                  </div>

                  {!readOnly ? (
                    <Button
                      variant="primary"
                      size="sm"
                      className="mt-3"
                      onClick={() => setRows((prev) => [...prev, emptyRow()])}
                    >
                      <Plus className="w-4 h-4" />
                      Kalem Sorusu Ekle
                    </Button>
                  ) : null}
                </section>
              </>
            )}
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              {readOnly ? "Kapat" : "Vazgeç"}
            </Button>
            {!readOnly ? (
              <Button
                variant="primary"
                size="sm"
                onClick={handleSubmit}
                disabled={!canSubmit || mutation.isPending || loadingDetail}
                loading={mutation.isPending}
              >
                {isEditMode ? "Değişiklikleri Kaydet" : "Şablonu Oluştur"}
              </Button>
            ) : null}
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
