"use client";

// V2-7+ — Kalem Sorusu Şablonu Oluştur / Düzenle / Görüntüle modal'ı.
// templateId verilirse düzenle/görüntüle modunda açılır (detay ön-doldurulur).
// Sahibi değilse salt-okunur (alanlar disabled, backend zaten düzenlemeyi engeller).

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Select } from "@/components/catalyst/select";
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
import { CheckCircle2, ListChecks, Lock, Plus, Trash2 } from "lucide-react";
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
    <Dialog open={open} onClose={handleClose} size="3xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <ListChecks className="h-5 w-5 text-zinc-700" />
        </div>
        <DialogTitle>{title}</DialogTitle>
      </div>

      <DialogBody className="space-y-6">
        {loadingDetail ? (
          <p className="text-sm text-zinc-500 text-center py-8">Yükleniyor…</p>
        ) : (
          <>
            {readOnly ? (
              <div className="flex items-center gap-2 px-3 py-2 rounded-lg bg-zinc-50 ring-1 ring-zinc-950/10 text-sm text-zinc-600">
                <Lock className="w-4 h-4 shrink-0" />
                Bu şablonu yalnızca oluşturan kişi düzenleyebilir. Görüntüleme
                modundasınız.
              </div>
            ) : null}

            {/* STEP 1 — İsim + Erişim */}
            <section>
              <div className="flex items-center gap-2 mb-3">
                <CheckCircle2 className="w-5 h-5 text-zinc-700" />
                <h3 className="font-semibold text-zinc-950">
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
                  <RadioGroup
                    value={isPublic ? "public" : "private"}
                    onChange={(v) => setIsPublic(v === "public")}
                    className="flex items-center gap-4 px-3 py-2.5 rounded-lg ring-1 ring-zinc-950/10 bg-white text-sm"
                  >
                    <div className="flex items-center gap-1.5">
                      <Radio value="public" disabled={readOnly} />
                      <span>Herkese Açık</span>
                    </div>
                    <div className="flex items-center gap-1.5">
                      <Radio value="private" disabled={readOnly} />
                      <span>Özel</span>
                    </div>
                  </RadioGroup>
                </Field>
              </div>
              <div className="flex items-start gap-2 mt-3">
                <Checkbox
                  className="mt-0.5"
                  checked={autoApply}
                  onChange={setAutoApply}
                  disabled={readOnly}
                />
                <span className="text-sm text-zinc-700">
                  Bu şablondaki soruların tamamı ihalelere otomatik olarak
                  eklensin.
                </span>
              </div>
            </section>

            {/* STEP 2 — Sorular */}
            <section>
              <div className="flex items-center gap-2 mb-1">
                <span className="w-6 h-6 rounded-full bg-zinc-900 text-white text-xs font-bold flex items-center justify-center">
                  2
                </span>
                <h3 className="font-semibold text-zinc-950">
                  Kalem sorularınızı belirleyiniz
                </h3>
              </div>
              <p className="text-xs text-zinc-500 ml-8 mb-3">
                Bu alanda tedarikçilerin cevaplamalarını istediğiniz özel
                soruları dilediğiniz kadar oluşturabilirsiniz.
              </p>

              <div className="space-y-2">
                {rows.map((r, idx) => (
                  <div key={idx} className="grid grid-cols-12 gap-2 items-start">
                    <div className="col-span-1 pt-3 text-center text-sm text-zinc-500 font-mono">
                      {idx + 1}
                    </div>
                    <div className="col-span-5">
                      <Input
                        placeholder="Kalem Sorusu *"
                        value={r.text}
                        onChange={(e) => updateRow(idx, { text: e.target.value })}
                        maxLength={500}
                        disabled={readOnly}
                      />
                    </div>
                    <div className="col-span-3">
                      <Select
                        value={r.required}
                        onChange={(e) =>
                          updateRow(idx, {
                            required: e.target.value as RowState["required"],
                          })
                        }
                        disabled={readOnly}
                      >
                        <option value="">Cevaplama Zorunluluğu *</option>
                        <option value="REQUIRED">Zorunlu</option>
                        <option value="OPTIONAL">İsteğe bağlı</option>
                      </Select>
                    </div>
                    <div className="col-span-2">
                      <Select
                        value={r.answerType}
                        onChange={(e) =>
                          updateRow(idx, {
                            answerType: e.target.value as RowState["answerType"],
                          })
                        }
                        disabled={readOnly}
                      >
                        <option value="">Cevap Türü *</option>
                        {ANSWER_TYPE_OPTIONS.map((o) => (
                          <option key={o.value} value={o.value}>
                            {o.label}
                          </option>
                        ))}
                      </Select>
                    </div>
                    <div className="col-span-1 pt-1.5 text-right">
                      {!readOnly && rows.length > 1 ? (
                        <button
                          type="button"
                          onClick={() => removeRow(idx)}
                          className="text-zinc-400 hover:text-danger-600 p-1.5"
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
                  className="mt-3"
                  onClick={() => setRows((prev) => [...prev, emptyRow()])}
                >
                  <Plus data-slot="icon" />
                  Kalem Sorusu Ekle
                </Button>
              ) : null}
            </section>
          </>
        )}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={mutation.isPending}>
          {readOnly ? "Kapat" : "Vazgeç"}
        </Button>
        {!readOnly ? (
          <Button
            onClick={handleSubmit}
            disabled={!canSubmit || mutation.isPending || loadingDetail}
          >
            {isEditMode ? "Değişiklikleri Kaydet" : "Şablonu Oluştur"}
          </Button>
        ) : null}
      </DialogActions>
    </Dialog>
  );
}
