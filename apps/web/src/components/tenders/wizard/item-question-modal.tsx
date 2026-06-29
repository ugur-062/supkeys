"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Select } from "@/components/catalyst/select";
import { Button as UiButton } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useQuestionTemplate,
  useQuestionTemplates,
  useSaveQuestionTemplate,
} from "@/hooks/use-templates";
import type { TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import { ChevronDown, HelpCircle, Info, LayoutTemplate, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { toast } from "sonner";

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
  const { control, register, getValues } = useFormContext<TenderFormData>();
  const { fields, append, remove, replace } = useFieldArray({
    control,
    name: `items.${index}.questions`,
    keyName: "_rfkey",
  });
  const saveTpl = useSaveQuestionTemplate();

  // Açılışta soru dizisinin anlık görüntüsü — "Vazgeç" buna geri döner.
  const snapshot = useRef<TenderFormData["items"][number]["questions"]>([]);
  useEffect(() => {
    if (open) {
      snapshot.current = (getValues(`items.${index}.questions`) ?? []).map(
        (q) => ({ ...q }),
      );
    }
  }, [open, index, getValues]);

  const handleCancel = () => {
    replace(snapshot.current ?? []);
    onClose();
  };

  const [nameOpen, setNameOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  const openSaveDialog = () => {
    const qs = getValues(`items.${index}.questions`) ?? [];
    const valid = qs.filter((q) => q.text.trim());
    if (valid.length === 0) {
      toast.error("Önce en az bir soru ekle");
      return;
    }
    setTplName("");
    setNameOpen(true);
  };

  const saveAsTemplate = async () => {
    const name = tplName.trim();
    if (!name) return;
    const qs = getValues(`items.${index}.questions`) ?? [];
    const valid = qs.filter((q) => q.text.trim());
    try {
      await saveTpl.mutateAsync({
        name,
        items: valid.map((q) => ({
          text: q.text.trim(),
          answerType: q.answerType,
          required: q.required,
        })),
      });
      toast.success("Soru şablonu kaydedildi");
      setNameOpen(false);
    } catch {
      toast.error("Şablon kaydedilemedi");
    }
  };

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
    <Dialog open={open} onClose={handleCancel} size="2xl">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <HelpCircle className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Kalem {index + 1} Soruları</DialogTitle>
          <DialogDescription>
            Bu kaleme birden fazla teknik soru ekleyebilirsiniz.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 flex gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Tedarikçi bu kaleme teklif verirken zorunlu işaretli soruları
            cevaplamak zorundadır.
          </span>
        </div>

        {/* Şablondan ekle */}
        <div className="rounded-lg ring-1 ring-zinc-950/10 overflow-hidden">
          <button
            type="button"
            onClick={() => setPickerOpen((o) => !o)}
            className="w-full flex items-center justify-between px-3 py-2.5 text-sm font-medium text-zinc-900 hover:bg-zinc-50 transition-colors"
          >
            <span className="flex items-center gap-2">
              <LayoutTemplate className="w-4 h-4" />
              Şablondan Soru Ekle
            </span>
            <ChevronDown
              className={cn(
                "w-4 h-4 text-zinc-400 transition-transform",
                pickerOpen && "rotate-180",
              )}
            />
          </button>
          {pickerOpen ? (
            <div className="px-3 py-3 border-t border-zinc-950/5 space-y-2.5 bg-zinc-50/40">
              {templates.isLoading ? (
                <p className="text-xs text-zinc-500">Yükleniyor…</p>
              ) : (templates.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-zinc-500">
                  Kayıtlı soru şablonunuz yok.
                </p>
              ) : (
                <>
                  <Select
                    value={tplId ?? ""}
                    onChange={(e) => {
                      setTplId(e.target.value || null);
                      setSelected(new Set());
                    }}
                  >
                    <option value="">Şablon seçin…</option>
                    {templates.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {t.name} ({t.itemCount} soru)
                      </option>
                    ))}
                  </Select>
                  {tplId && tplDetail.isLoading ? (
                    <p className="text-xs text-zinc-500">Sorular yükleniyor…</p>
                  ) : tplDetail.data ? (
                    <>
                      <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                        {tplDetail.data.items.map((q) => (
                          <li key={q.id}>
                            <div className="flex items-start gap-2.5 px-2.5 py-2 rounded-md bg-white ring-1 ring-zinc-950/5">
                              <Checkbox
                                className="mt-0.5"
                                checked={selected.has(q.id)}
                                onChange={(checked) => {
                                  setSelected((prev) => {
                                    const next = new Set(prev);
                                    if (checked) next.add(q.id);
                                    else next.delete(q.id);
                                    return next;
                                  });
                                }}
                              />
                              <span className="min-w-0">
                                <span className="text-sm text-zinc-900 block">
                                  {q.text}
                                </span>
                                <span className="text-[11px] text-zinc-500">
                                  {ANSWER_TYPES.find(
                                    (a) => a.value === q.answerType,
                                  )?.label ?? q.answerType}
                                  {q.required ? " · Zorunlu" : ""}
                                </span>
                              </span>
                            </div>
                          </li>
                        ))}
                      </ul>
                      <UiButton
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={addSelectedFromTemplate}
                        disabled={selected.size === 0}
                      >
                        <Plus className="w-4 h-4" />
                        Seçilenleri Ekle ({selected.size})
                      </UiButton>
                    </>
                  ) : null}
                </>
              )}
            </div>
          ) : null}
        </div>

        {/* Soru listesi */}
        {fields.length === 0 ? (
          <p className="text-sm text-zinc-500 text-center py-4">
            Henüz soru yok. "Soru Ekle" ile başlayın veya şablondan seçin.
          </p>
        ) : (
          <div className="space-y-3">
            {fields.map((f, qi) => (
              <div
                key={f._rfkey}
                className="rounded-lg ring-1 ring-zinc-950/10 p-3 space-y-2.5"
              >
                <div className="flex items-start justify-between gap-2">
                  <span className="text-xs font-semibold text-zinc-500">
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
                      className="text-xs text-zinc-500 mb-0"
                    >
                      Cevap tipi
                    </Label>
                    <Select
                      id={`q-type-${index}-${qi}`}
                      className="!w-auto"
                      {...register(`items.${index}.questions.${qi}.answerType`)}
                    >
                      {ANSWER_TYPES.map((a) => (
                        <option key={a.value} value={a.value}>
                          {a.label}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Controller
                    control={control}
                    name={`items.${index}.questions.${qi}.required`}
                    render={({ field }) => (
                      <div className="flex items-center gap-1.5 text-sm text-zinc-700">
                        <Checkbox
                          checked={!!field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                        <span>Zorunlu</span>
                      </div>
                    )}
                  />
                </div>
              </div>
            ))}
          </div>
        )}

        <UiButton type="button" variant="ghost" size="sm" onClick={addBlank}>
          <Plus className="w-4 h-4" />
          Soru Ekle
        </UiButton>
      </DialogBody>

      <DialogActions>
        <Button
          plain
          onClick={openSaveDialog}
          disabled={saveTpl.isPending}
        >
          <Save data-slot="icon" />
          Şablon Olarak Kaydet
        </Button>
        <Button plain onClick={handleCancel}>
          Vazgeç
        </Button>
        <Button onClick={onClose}>Tamam</Button>
      </DialogActions>

      {/* Şablon adı diyaloğu (window.prompt yerine) */}
      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} size="sm">
        <DialogTitle>Şablon Adı</DialogTitle>
        <DialogBody>
          <Input
            autoFocus
            maxLength={120}
            placeholder="Örn. Standart teknik sorular"
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tplName.trim()) saveAsTemplate();
            }}
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNameOpen(false)}>
            Vazgeç
          </Button>
          <Button
            onClick={saveAsTemplate}
            disabled={!tplName.trim() || saveTpl.isPending}
          >
            Kaydet
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
