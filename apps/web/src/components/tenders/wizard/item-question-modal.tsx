"use client";

import { useTranslations } from "next-intl";
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
import { ANSWER_TYPE_VALUES, type TenderFormData } from "@/lib/tenders/form-schema";
import { cn } from "@/lib/utils";
import { ChevronDown, HelpCircle, Info, LayoutTemplate, Plus, Save, Trash2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { Controller, useFieldArray, useFormContext } from "react-hook-form";
import { extractErrorMessage } from "@/lib/tenders/error";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  index: number;
}

function newId(): string {
  try {
    return crypto.randomUUID();
  } catch {
    return `q_${Date.now()}_${Math.random().toString(36).slice(2, 8)}`;
  }
}

export function ItemQuestionModal({ open, onClose, index }: Props) {
  const tr = useTranslations("web.panel.requests.itemQuestionModal");
  /** Cevap türü etiketi (`cevapTipi.<KOD>`); bilinmeyen kod olduğu gibi. */
  const answerTypeLabel = (v: string) => (tr.has(`cevapTipi.${v}` as never) ? tr(`cevapTipi.${v}` as never) : v);
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

  // "Tamam" — boş metinli soruları at (aksi halde kalem rozeti "Sorular (1)"
  // gösterir ama publish'te min(1) doğrulaması patlar).
  const handleDone = () => {
    const qs = getValues(`items.${index}.questions`) ?? [];
    const filled = qs.filter((q) => q.text.trim());
    if (filled.length !== qs.length) replace(filled);
    onClose();
  };

  const [nameOpen, setNameOpen] = useState(false);
  const [tplName, setTplName] = useState("");

  const openSaveDialog = () => {
    const qs = getValues(`items.${index}.questions`) ?? [];
    const valid = qs.filter((q) => q.text.trim());
    if (valid.length === 0) {
      toast.error(tr("onceEnAzBirSoru"));
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
      toast.success(tr("soruSablonuKaydedildi"));
      setNameOpen(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, tr("sablonKaydedilemedi")));
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
          <DialogTitle>{tr("kalemSorulari", { n: index + 1 })}</DialogTitle>
          <DialogDescription>
            {tr("buKalemeBirdenFazlaTeknik")}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm text-warning-800 flex gap-2">
          <Info className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            {tr("tedarikciBuKalemeTeklifVerirken")}
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
              {tr("sablondanSoruEkle")}
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
                <p className="text-xs text-zinc-500">{tr("yukleniyor")}</p>
              ) : (templates.data?.length ?? 0) === 0 ? (
                <p className="text-xs text-zinc-500">
                  {tr("kayitliSoruSablonunuzYok")}
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
                    <option value="">{tr("sablonSecin")}</option>
                    {templates.data?.map((t) => (
                      <option key={t.id} value={t.id}>
                        {tr("soru", { name: t.name, itemCount: t.itemCount })}
                      </option>
                    ))}
                  </Select>
                  {tplId && tplDetail.isLoading ? (
                    <p className="text-xs text-zinc-500">{tr("sorularYukleniyor")}</p>
                  ) : tplDetail.data ? (
                    <>
                      <ul className="space-y-1 max-h-44 overflow-y-auto pr-1">
                        {tplDetail.data.items.map((q) => (
                          <li key={q.id}>
                            <div className="flex items-start gap-3 px-2.5 py-2 rounded-md bg-white ring-1 ring-zinc-950/5">
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
                                <span className="text-xs text-zinc-500">
                                  {tr("cevapTuruDeger", { label: answerTypeLabel(q.answerType) })}
                                  {q.required ? ` ${tr("zorunlu")}` : ""}
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
                        {tr("secilenleriEkle", { size: selected.size })}
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
            {tr("henuzSoruYokSoruEkle")}
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
                    {tr("soruN", { n: qi + 1 })}
                  </span>
                  <button
                    type="button"
                    onClick={() => remove(qi)}
                    aria-label={tr("soruyuKaldir")}
                    className="text-danger-500 hover:text-danger-700"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
                <Input
                  placeholder={tr("ornGarantiSuresiNedir")}
                  maxLength={500}
                  {...register(`items.${index}.questions.${qi}.text`)}
                />
                <div className="flex items-center gap-3 flex-wrap">
                  <div className="flex items-center gap-2">
                    <Label
                      htmlFor={`q-type-${index}-${qi}`}
                      className="text-xs text-zinc-500 mb-0"
                    >
                      {tr("cevapTuru")}
                    </Label>
                    <Select
                      id={`q-type-${index}-${qi}`}
                      className="!w-auto"
                      {...register(`items.${index}.questions.${qi}.answerType`)}
                    >
                      {ANSWER_TYPE_VALUES.map((a) => (
                        <option key={a} value={a}>
                          {answerTypeLabel(a)}
                        </option>
                      ))}
                    </Select>
                  </div>
                  <Controller
                    control={control}
                    name={`items.${index}.questions.${qi}.required`}
                    render={({ field }) => (
                      <div className="flex items-center gap-2 text-sm text-zinc-700">
                        <Checkbox
                          aria-label={tr("zorunluSoru")}
                          checked={!!field.value}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                        />
                        <span>{tr("zorunlu2")}</span>
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
          {tr("soruEkle")}
        </UiButton>
      </DialogBody>

      <DialogActions>
        <Button
          plain
          onClick={openSaveDialog}
          disabled={saveTpl.isPending}
        >
          <Save data-slot="icon" />
          {tr("sablonOlarakKaydet")}
        </Button>
        <Button plain onClick={handleCancel}>
          {tr("vazgec")}
        </Button>
        <Button onClick={handleDone}>{tr("tamam")}</Button>
      </DialogActions>

      {/* Şablon adı diyaloğu (window.prompt yerine) */}
      <Dialog open={nameOpen} onClose={() => setNameOpen(false)} size="sm">
        <DialogTitle>{tr("sablonAdi")}</DialogTitle>
        <DialogBody>
          <Input
            autoFocus
            maxLength={120}
            placeholder={tr("ornStandartTeknikSorular")}
            value={tplName}
            onChange={(e) => setTplName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && tplName.trim()) saveAsTemplate();
            }}
          />
        </DialogBody>
        <DialogActions>
          <Button plain onClick={() => setNameOpen(false)}>
            {tr("vazgec")}
          </Button>
          <Button
            onClick={saveAsTemplate}
            disabled={!tplName.trim() || saveTpl.isPending}
          >
            {tr("kaydet")}
          </Button>
        </DialogActions>
      </Dialog>
    </Dialog>
  );
}
