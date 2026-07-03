"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Heading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import { useConnections } from "@/hooks/use-company-connections";
import {
  useDeleteTemplate,
  useListingTemplates,
} from "@/hooks/use-listing-templates";
import {
  useCreateSupplierTemplate,
  useDeleteSupplierTemplate,
  useSupplierTemplateDetail,
  useSupplierTemplates,
  useUpdateSupplierTemplate,
} from "@/hooks/use-supplier-templates";
import {
  useDeleteQuestionTemplate,
  useQuestionTemplates,
  useSaveQuestionTemplate,
} from "@/hooks/use-templates";
import type { AnswerTypeValue } from "@/lib/tenders/form-schema";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import {
  ArrowLeft,
  FileText,
  ListChecks,
  Pencil,
  Plus,
  Trash2,
  Users,
  type LucideIcon,
} from "lucide-react";
import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

const ANSWER_LABEL: Record<AnswerTypeValue, string> = {
  TEXT: "Metin",
  NUMBER: "Sayı",
  YES_NO: "Evet/Hayır",
  DATE: "Tarih",
};

/** Bölüm kabuğu — ikonlu başlık + sağda aksiyon, içerik kart ızgarası. */
function Section({
  icon: Icon,
  title,
  description,
  action,
  children,
}: {
  icon: LucideIcon;
  title: string;
  description: string;
  action?: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-zinc-950/5 bg-white p-5 shadow-sm md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-2.5">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-4.5 w-4.5 text-zinc-700" aria-hidden="true" />
          </div>
          <div>
            <h3 className="font-semibold text-zinc-900">{title}</h3>
            <p className="text-xs text-zinc-500">{description}</p>
          </div>
        </div>
        {action}
      </div>
      {children}
    </section>
  );
}

function EmptyHint({ children }: { children: React.ReactNode }) {
  return (
    <div className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-6 text-center text-sm text-zinc-500">
      {children}
    </div>
  );
}

/* ───────────────────────── Grup (tedarikçi/alıcı) şablonları ───────────── */

function GroupTemplateDialog({
  partyWord,
  editId,
  onClose,
}: {
  partyWord: string;
  editId: string | null; // null = yeni
  onClose: () => void;
}) {
  const connections = useConnections();
  const detail = useSupplierTemplateDetail(editId ?? "");
  const create = useCreateSupplierTemplate();
  const update = useUpdateSupplierTemplate();
  const [name, setName] = useState("");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [seeded, setSeeded] = useState(false);

  // Düzenlemede mevcut ad + üyelerle tohumla (bir kez).
  useEffect(() => {
    if (!editId || !detail.data || seeded) return;
    setSeeded(true);
    setName(detail.data.name);
    setSelected(new Set(detail.data.members.map((m) => m.id)));
  }, [editId, detail.data, seeded]);

  const toggle = (id: string) =>
    setSelected((s) => {
      const next = new Set(s);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const pending = create.isPending || update.isPending;
  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Grup adı en az 2 karakter olmalı");
      return;
    }
    if (selected.size === 0) {
      toast.error("En az 1 firma seçin");
      return;
    }
    try {
      if (editId) {
        await update.mutateAsync({
          id: editId,
          name: name.trim(),
          memberCompanyIds: [...selected],
        });
        toast.success("Grup güncellendi");
      } else {
        await create.mutateAsync({
          name: name.trim(),
          memberCompanyIds: [...selected],
        });
        toast.success("Grup kaydedildi");
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  const rows = connections.data ?? [];
  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>
        {editId ? "Grubu Düzenle" : `Yeni ${partyWord} Grubu`}
      </DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Grup adı</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. İnşaat malzemesi tedarikçileri"
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-950">
            Üyeler{" "}
            <span className="font-normal text-zinc-400">
              (bağlantılarınızdan · {selected.size} seçili)
            </span>
          </p>
          {connections.isLoading ? (
            <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
          ) : rows.length === 0 ? (
            <EmptyHint>
              Henüz bağlantınız yok — önce Bağlantılar sayfasından firma
              ekleyin.
            </EmptyHint>
          ) : (
            <div className="max-h-72 space-y-1 overflow-y-auto rounded-xl border border-zinc-200 p-2">
              {rows.map((c) => (
                <label
                  key={c.company.id}
                  className={cn(
                    "flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 transition-colors hover:bg-zinc-50",
                    selected.has(c.company.id) && "bg-zinc-50",
                  )}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(c.company.id)}
                    onChange={() => toggle(c.company.id)}
                    className="h-4 w-4 rounded border-zinc-300"
                  />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-medium text-zinc-900">
                      {c.company.name}
                    </span>
                    <span className="block truncate text-xs text-zinc-400">
                      {[c.company.city, c.company.industry]
                        .filter(Boolean)
                        .join(" · ") || c.company.supkeysId || ""}
                    </span>
                  </span>
                </label>
              ))}
            </div>
          )}
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={pending}>
          {editId ? "Kaydet" : "Grubu Oluştur"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ───────────────────────── Soru seti dialogu ──────────────────────────── */

interface QuestionRow {
  text: string;
  answerType: AnswerTypeValue;
  required: boolean;
}

function QuestionTemplateDialog({ onClose }: { onClose: () => void }) {
  const save = useSaveQuestionTemplate();
  const [name, setName] = useState("");
  const [rows, setRows] = useState<QuestionRow[]>([
    { text: "", answerType: "TEXT", required: false },
  ]);

  const setRow = (i: number, patch: Partial<QuestionRow>) =>
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error("Set adı en az 2 karakter olmalı");
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
      toast.success("Soru seti kaydedildi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>Yeni Soru Seti</DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>Set adı</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="Örn. Kalite belgeleri soruları"
          />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-950">Sorular</span>
            <Button
              plain
              onClick={() =>
                setRows((s) => [
                  ...s,
                  { text: "", answerType: "TEXT", required: false },
                ])
              }
            >
              <Plus data-slot="icon" />
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
                    setRow(i, {
                      answerType: e.target.value as AnswerTypeValue,
                    })
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
                  <Button
                    plain
                    onClick={() =>
                      setRows((s) => s.filter((_, idx) => idx !== i))
                    }
                  >
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

/* ───────────────────────── Alt sayfa görünümleri ──────────────────────── */

function useDeleteWithConfirm() {
  const confirm = useConfirm();
  return async (kind: string, name: string, fn: () => Promise<unknown>) => {
    if (
      !(await confirm({
        title: `${kind} sil`,
        description: `"${name}" silinsin mi? Bu işlem geri alınamaz.`,
        confirmLabel: "Sil",
        destructive: true,
      }))
    )
      return;
    try {
      await fn();
      toast.success("Silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };
}

function BackNav({ basePath }: { basePath: string }) {
  return (
    <nav className="text-sm text-zinc-500">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 hover:text-zinc-800 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        Şablonlar
      </Link>
    </nav>
  );
}

/** Tedarikçi (ALIM) / Alıcı (SATIS) Grupları — bağımsız alt sayfa. */
export function GroupTemplatesView({
  type,
  basePath,
}: {
  type: "ALIM" | "SATIS";
  basePath: string;
}) {
  const partyWord = type === "ALIM" ? "Tedarikçi" : "Alıcı";
  const groups = useSupplierTemplates();
  const deleteGroup = useDeleteSupplierTemplate();
  const del = useDeleteWithConfirm();
  const [dialog, setDialog] = useState<{ editId: string | null } | null>(null);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={Users}
        title={`${partyWord} Grupları`}
        description="Birlikte davet ettiğiniz firmaları gruplayın — sihirbazın davet adımında tek tıkla ekleyin."
        action={
          <Button onClick={() => setDialog({ editId: null })}>
            <Plus data-slot="icon" />
            Yeni Grup
          </Button>
        }
      >
        {groups.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : (groups.data ?? []).length === 0 ? (
          <EmptyHint>
            Henüz grup yok. Bağlantılarınızdan bir {partyWord.toLowerCase()}{" "}
            grubu oluşturun.
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(groups.data ?? []).map((g) => (
              <li
                key={g.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:border-zinc-300"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{g.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {g.memberCount} firma ·{" "}
                    {format(new Date(g.updatedAt), "d MMM yyyy", {
                      locale: tr,
                    })}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    plain
                    aria-label={`${g.name} grubunu düzenle`}
                    onClick={() => setDialog({ editId: g.id })}
                  >
                    <Pencil className="h-4 w-4 text-zinc-400" />
                  </Button>
                  <Button
                    plain
                    aria-label={`${g.name} grubunu sil`}
                    onClick={() =>
                      del("Grubu", g.name, () => deleteGroup.mutateAsync(g.id))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {dialog ? (
        <GroupTemplateDialog
          partyWord={partyWord}
          editId={dialog.editId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** Soru Setleri — bağımsız alt sayfa (iki portalda ortak veri). */
export function QuestionTemplatesView({ basePath }: { basePath: string }) {
  const questionTpls = useQuestionTemplates();
  const deleteQuestion = useDeleteQuestionTemplate();
  const del = useDeleteWithConfirm();
  const [dialog, setDialog] = useState(false);

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={ListChecks}
        title="Soru Setleri"
        description="Kalem sorularını set olarak kaydedin — sihirbazın kalem adımında yeniden kullanın."
        action={
          <Button onClick={() => setDialog(true)}>
            <Plus data-slot="icon" />
            Yeni Set
          </Button>
        }
      >
        {questionTpls.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : (questionTpls.data ?? []).length === 0 ? (
          <EmptyHint>
            Henüz soru seti yok. Menşei, garanti, sertifika gibi standart
            sorularınızı sete dönüştürün.
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(questionTpls.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:border-zinc-300"
              >
                <div className="min-w-0">
                  <p className="truncate font-medium text-zinc-900">{t.name}</p>
                  <p className="mt-0.5 text-xs text-zinc-400">
                    {t.itemCount} soru
                  </p>
                </div>
                <Button
                  plain
                  aria-label={`${t.name} setini sil`}
                  onClick={() =>
                    del("Soru setini", t.name, () =>
                      deleteQuestion.mutateAsync(t.id),
                    )
                  }
                >
                  <Trash2 className="h-4 w-4 text-red-500" />
                </Button>
              </li>
            ))}
          </ul>
        )}
      </Section>
      {dialog ? (
        <QuestionTemplateDialog onClose={() => setDialog(false)} />
      ) : null}
    </div>
  );
}

/** İhale/İlan Şablonları — bağımsız alt sayfa (portal tipine göre süzülür). */
export function ListingTemplatesView({
  type,
  basePath,
}: {
  type: "ALIM" | "SATIS";
  basePath: string;
}) {
  const isAlim = type === "ALIM";
  const listingTpls = useListingTemplates();
  const deleteListingTpl = useDeleteTemplate();
  const del = useDeleteWithConfirm();

  const myListingTpls = useMemo(
    () =>
      (listingTpls.data ?? []).filter(
        (t) =>
          ((t.payload as { listingType?: string })?.listingType ?? "ALIM") ===
          type,
      ),
    [listingTpls.data, type],
  );

  return (
    <div className="mx-auto max-w-4xl space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={FileText}
        title={isAlim ? "İhale Şablonları" : "İlan Şablonları"}
        description={`Sihirbazda "Şablon Olarak Kaydet" ile oluşur; yeni ${
          isAlim ? "ihalede" : "ilanda"
        } "Şablondan Yükle" menüsünden uygulanır.`}
      >
        {listingTpls.isLoading ? (
          <Text className="text-sm text-zinc-500">Yükleniyor…</Text>
        ) : myListingTpls.length === 0 ? (
          <EmptyHint>
            Henüz şablon yok. Sihirbazın üst çubuğundaki &quot;Şablon Olarak
            Kaydet&quot; ile ilk şablonunuzu oluşturun.
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {myListingTpls.map((t) => {
              const p = t.payload as { title?: string; items?: unknown[] };
              return (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/10 p-4 transition-colors hover:border-zinc-300"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-medium text-zinc-900">
                        {t.name}
                      </p>
                      <Badge color={isAlim ? "blue" : "emerald"}>
                        {isAlim ? "Alım" : "Satış"}
                      </Badge>
                    </div>
                    <p className="mt-0.5 truncate text-xs text-zinc-400">
                      {p.items?.length ? `${p.items.length} kalem` : "—"}
                      {p.title ? ` · ${p.title}` : ""}
                    </p>
                  </div>
                  <Button
                    plain
                    aria-label={`${t.name} şablonunu sil`}
                    onClick={() =>
                      del("Şablonu", t.name, () =>
                        deleteListingTpl.mutateAsync(t.id),
                      )
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
