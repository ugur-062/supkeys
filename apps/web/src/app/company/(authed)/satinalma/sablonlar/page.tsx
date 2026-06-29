"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading, Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import {
  useDeleteTemplate,
  useListingTemplates,
} from "@/hooks/use-listing-templates";
import {
  useDeleteQuestionTemplate,
  useQuestionTemplates,
  useSaveQuestionTemplate,
} from "@/hooks/use-templates";
import type { AnswerTypeValue } from "@/lib/tenders/form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Plus, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const ANSWER_LABEL: Record<AnswerTypeValue, string> = {
  TEXT: "Metin",
  NUMBER: "Sayı",
  YES_NO: "Evet/Hayır",
  DATE: "Tarih",
};

export default function SablonlarPage() {
  const listingTpls = useListingTemplates();
  const deleteListingTpl = useDeleteTemplate();
  const questionTpls = useQuestionTemplates();
  const deleteQuestionTpl = useDeleteQuestionTemplate();
  const [createOpen, setCreateOpen] = useState(false);

  const delListing = async (id: string, name: string) => {
    if (!confirm(`"${name}" şablonu silinsin mi?`)) return;
    try {
      await deleteListingTpl.mutateAsync(id);
      toast.success("Şablon silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  const delQuestion = async (id: string, name: string) => {
    if (!confirm(`"${name}" şablonu silinsin mi?`)) return;
    try {
      await deleteQuestionTpl.mutateAsync(id);
      toast.success("Şablon silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-3xl space-y-8">
      <div>
        <Heading>Şablonlar</Heading>
        <Text className="mt-1 text-sm text-zinc-500">
          İhale taslaklarını ve kalem-sorusu setlerini kaydedip yeniden kullanın.
        </Text>
      </div>

      {/* İhale şablonları */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <Subheading>İhale Şablonları</Subheading>
        <Text className="mt-0.5 text-sm text-zinc-500">
          İhale sihirbazında "Şablon Olarak Kaydet" ile oluşturulur.
        </Text>
        {listingTpls.isLoading ? (
          <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !listingTpls.data || listingTpls.data.length === 0 ? (
          <Text className="mt-3 text-sm text-zinc-400">Henüz şablon yok.</Text>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {listingTpls.data.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="text-sm font-medium text-zinc-900">
                  {t.name}
                </span>
                <Button plain onClick={() => delListing(t.id, t.name)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {/* Kalem sorusu şablonları */}
      <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
        <div className="flex items-center justify-between">
          <Subheading>Kalem Sorusu Şablonları</Subheading>
          <Button onClick={() => setCreateOpen(true)}>Yeni Set</Button>
        </div>
        {questionTpls.isLoading ? (
          <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
        ) : !questionTpls.data || questionTpls.data.length === 0 ? (
          <Text className="mt-3 text-sm text-zinc-400">Henüz set yok.</Text>
        ) : (
          <ul className="mt-3 divide-y divide-zinc-100">
            {questionTpls.data.map((t) => (
              <li
                key={t.id}
                className="flex items-center justify-between gap-3 py-2.5"
              >
                <span className="text-sm font-medium text-zinc-900">
                  {t.name}
                  <span className="ml-2 text-xs text-zinc-400">
                    {t.itemCount} soru
                  </span>
                </span>
                <Button plain onClick={() => delQuestion(t.id, t.name)}>
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </section>

      {createOpen ? (
        <QuestionTemplateDialog onClose={() => setCreateOpen(false)} />
      ) : null}
    </div>
  );
}

interface Row {
  text: string;
  answerType: AnswerTypeValue;
  required: boolean;
}

function QuestionTemplateDialog({ onClose }: { onClose: () => void }) {
  const save = useSaveQuestionTemplate();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<Row[]>([
    { text: "", answerType: "TEXT", required: false },
  ]);

  const setRow = (i: number, patch: Partial<Row>) =>
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));
  const addRow = () =>
    setRows((s) => [...s, { text: "", answerType: "TEXT", required: false }]);
  const removeRow = (i: number) =>
    setRows((s) => s.filter((_, idx) => idx !== i));

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Şablon adı en az 2 karakter");
      return;
    }
    const items = rows.filter((r) => r.text.trim());
    if (items.length === 0) {
      toast.error("En az 1 soru girin");
      return;
    }
    try {
      await save.mutateAsync({
        name: name.trim(),
        items: items.map((r) => ({
          text: r.text.trim(),
          answerType: r.answerType,
          required: r.required,
        })),
      });
      toast.success("Şablon kaydedildi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>Yeni Kalem Sorusu Seti</DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Set adı</Label>
          <Input value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-950">Sorular</span>
            <Button plain onClick={addRow}>
              <Plus className="h-4 w-4" />
              Soru Ekle
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div key={i} className="flex items-center gap-2">
                <Input
                  value={r.text}
                  onChange={(e) => setRow(i, { text: e.target.value })}
                  placeholder="Soru metni"
                  className="flex-1"
                />
                <Select
                  value={r.answerType}
                  onChange={(e) =>
                    setRow(i, { answerType: e.target.value as AnswerTypeValue })
                  }
                  className="w-36"
                >
                  {(Object.keys(ANSWER_LABEL) as AnswerTypeValue[]).map((a) => (
                    <option key={a} value={a}>
                      {ANSWER_LABEL[a]}
                    </option>
                  ))}
                </Select>
                <label className="flex items-center gap-1 text-xs text-zinc-600">
                  <input
                    type="checkbox"
                    checked={r.required}
                    onChange={(e) => setRow(i, { required: e.target.checked })}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  Zorunlu
                </label>
                {rows.length > 1 ? (
                  <Button plain onClick={() => removeRow(i)}>
                    <Trash2 className="h-4 w-4 text-zinc-400" />
                  </Button>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
