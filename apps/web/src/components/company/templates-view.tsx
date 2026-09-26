"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { formatDate } from "@/lib/format-date";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { useHasCompanyPermission } from "@/hooks/use-company-auth";
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
  useQuestionTemplate,
  useQuestionTemplates,
  useSaveQuestionTemplate,
  useUpdateQuestionTemplate,
} from "@/hooks/use-templates";
import type { AnswerTypeValue } from "@/lib/tenders/form-schema";
import { ListSkeleton } from "@/components/list";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
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
import { Link } from "@/i18n/navigation";
import { useEffect, useMemo, useState } from "react";
import { toast } from "sonner";

/** Cevap türü seçenekleri — etiket `answerType.<KOD>` anahtarından. */
const ANSWER_TYPES: readonly AnswerTypeValue[] = ["TEXT", "NUMBER", "YES_NO", "DATE"];

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
    <section className="card p-5 md:p-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100">
            <Icon className="h-4.5 w-4.5 text-zinc-700" aria-hidden="true" />
          </div>
          <div>
            {/* Her görünümde TEK bölüm var → bölüm başlığı sayfanın h1'i
                (2026-09-19: bu üç sayfa h1'siz kalan tek panel sayfalarıydı). */}
            <h1 className="font-semibold text-zinc-900">{title}</h1>
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
  const t = useTranslations("web.panel.trade.templatesView");
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
      toast.error(t("grupAdiEnAz2"));
      return;
    }
    if (selected.size === 0) {
      toast.error(t("enAz1FirmaSecin"));
      return;
    }
    try {
      if (editId) {
        await update.mutateAsync({
          id: editId,
          name: name.trim(),
          memberCompanyIds: [...selected],
        });
        toast.success(t("grupGuncellendi"));
      } else {
        await create.mutateAsync({
          name: name.trim(),
          memberCompanyIds: [...selected],
        });
        toast.success(t("grupKaydedildi"));
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  const rows = connections.data ?? [];
  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>
        {editId ? t("grubuDuzenle") : t("yeniGrubu", { partyWord: partyWord })}
      </DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>{t("grupAdi")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("ornInsaatMalzemesiTedarikcileri")}
          />
        </Field>
        <div>
          <p className="mb-2 text-sm font-medium text-zinc-950">
            {t("uyeler")}{" "}
            <span className="font-normal text-zinc-400">
              {t("baglantilarinizdanSecili", { size: selected.size })}
            </span>
          </p>
          {connections.isLoading ? (
            <ListSkeleton rows={3} />
          ) : rows.length === 0 ? (
            <EmptyHint>
              {t("henuzBaglantinizYokOnceBaglantilar")}
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
                        .join(" · ") || c.company.rothernId || ""}
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
          {t("vazgec")}
        </Button>
        <Button onClick={submit} disabled={pending}>
          {editId ? t("kaydet") : t("grubuOlustur")}
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

function QuestionTemplateDialog({
  editId,
  onClose,
}: {
  editId: string | null;
  onClose: () => void;
}) {
  const t = useTranslations("web.panel.trade.templatesView");
  const save = useSaveQuestionTemplate();
  const update = useUpdateQuestionTemplate();
  const existing = useQuestionTemplate(editId);
  const [name, setName] = useState("");
  const [rows, setRows] = useState<QuestionRow[]>([
    { text: "", answerType: "TEXT", required: false },
  ]);
  // Düzenlemede mevcut set yüklenince formu doldur (bir kez — detay tekil).
  useEffect(() => {
    if (!existing.data) return;
    setName(existing.data.name);
    setRows(
      existing.data.items.map((q) => ({
        text: q.text,
        answerType: q.answerType,
        required: q.required,
      })),
    );
  }, [existing.data]);

  const setRow = (i: number, patch: Partial<QuestionRow>) =>
    setRows((s) => s.map((r, idx) => (idx === i ? { ...r, ...patch } : r)));

  const submit = async () => {
    if (name.trim().length < 2) {
      toast.error(t("setAdiEnAz2"));
      return;
    }
    const items = rows.filter((r) => r.text.trim());
    if (items.length === 0) {
      toast.error(t("enAz1SoruGirin"));
      return;
    }
    const payload = {
      name: name.trim(),
      items: items.map((r) => ({
        text: r.text.trim(),
        answerType: r.answerType,
        required: r.required,
      })),
    };
    try {
      if (editId) {
        await update.mutateAsync({ id: editId, ...payload });
        toast.success(t("soruSetiGuncellendi"));
      } else {
        await save.mutateAsync(payload);
        toast.success(t("soruSetiKaydedildi"));
      }
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>{editId ? t("soruSetiniDuzenle") : t("yeniSoruSeti")}</DialogTitle>
      <DialogBody className="space-y-4">
        <Field>
          <Label>{t("setAdi")}</Label>
          <Input
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder={t("ornKaliteBelgeleriSorulari")}
          />
        </Field>
        <div>
          <div className="mb-2 flex items-center justify-between">
            <span className="text-sm font-medium text-zinc-950">{t("sorular")}</span>
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
              {t("soruEkle")}
            </Button>
          </div>
          <div className="space-y-2">
            {rows.map((r, i) => (
              <div
                key={i}
                className="space-y-2 rounded-lg p-3 ring-1 ring-zinc-950/10"
              >
                <Input
                  value={r.text}
                  onChange={(e) => setRow(i, { text: e.target.value })}
                  placeholder={t("soruOrnGarantiSuresiNedir", { n: i + 1 })}
                  maxLength={500}
                />
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor={`question-answer-type-${i}`}
                    className="flex items-center gap-2 text-xs text-zinc-500"
                  >
                    {t("cevapTuru")}
                  </label>
                  {/* Catalyst Select sarmalayıcısı w-full içerir; sabit
                      genişlik ancak !important ile uygulanır (wizard deseni). */}
                  <Select
                    id={`question-answer-type-${i}`}
                    value={r.answerType}
                    onChange={(e) =>
                      setRow(i, {
                        answerType: e.target.value as AnswerTypeValue,
                      })
                    }
                    className="!w-auto"
                  >
                    {ANSWER_TYPES.map((a) => (
                      <option key={a} value={a}>
                        {t(`answerType.${a}`)}
                      </option>
                    ))}
                  </Select>
                  <label className="flex items-center gap-2 text-sm text-zinc-600">
                    <input
                      type="checkbox"
                      checked={r.required}
                      onChange={(e) => setRow(i, { required: e.target.checked })}
                      className="h-4 w-4 rounded border-zinc-300"
                    />
                    {t("zorunlu")}
                  </label>
                  {rows.length > 1 ? (
                    <Button
                      plain
                      className="ml-auto"
                      aria-label={t("soruyuKaldir")}
                      onClick={() =>
                        setRows((s) => s.filter((_, idx) => idx !== i))
                      }
                    >
                      <Trash2 className="h-4 w-4 text-zinc-400" />
                    </Button>
                  ) : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button
          onClick={submit}
          disabled={save.isPending || update.isPending || existing.isLoading}
        >
          {t("kaydet")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}

/* ───────────────────────── Alt sayfa görünümleri ──────────────────────── */

function useDeleteWithConfirm() {
  const t = useTranslations("web.panel.trade.templatesView");
  const confirm = useConfirm();
  return async (kind: string, name: string, fn: () => Promise<unknown>) => {
    if (
      !(await confirm({
        title: t("silBaslik", { kind }),
        description: t("silinsinMiBuIslemGeri", { name: name }),
        confirmLabel: t("sil"),
        destructive: true,
      }))
    )
      return;
    try {
      await fn();
      toast.success(t("silindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
    }
  };
}

function BackNav({ basePath }: { basePath: string }) {
  const t = useTranslations("web.panel.trade.templatesView");
  return (
    <nav className="text-sm text-zinc-500">
      <Link
        href={basePath}
        className="inline-flex items-center gap-1 hover:text-zinc-800 hover:underline"
      >
        <ArrowLeft className="h-3.5 w-3.5" />
        {t("sablonlar")}
      </Link>
    </nav>
  );
}

/** Tedarikçi Grupları — bağımsız alt sayfa. */
export function GroupTemplatesView({ basePath }: { basePath: string }) {
  const t = useTranslations("web.panel.trade.templatesView");
  const locale = useLocale() as Locale;
  const partyWord = t("tedarikci");
  // F7: şablon yazma templates:manage ister (Kurucu/Yönetici) — izinsiz
  // üye listeleri salt-okunur görür.
  const canManageTpl = useHasCompanyPermission("templates:manage");
  const groups = useSupplierTemplates();
  const deleteGroup = useDeleteSupplierTemplate();
  const del = useDeleteWithConfirm();
  const [dialog, setDialog] = useState<{ editId: string | null } | null>(null);

  return (
    <div className="space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={Users}
        title={t("gruplari", { partyWord: partyWord })}
        description={t("birlikteDavetEttiginizFirmalariGruplayin")}
        action={
          canManageTpl ? (
            <Button onClick={() => setDialog({ editId: null })}>
              <Plus data-slot="icon" />
              {t("yeniGrup")}
            </Button>
          ) : undefined
        }
      >
        {groups.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (groups.data ?? []).length === 0 ? (
          <EmptyHint>
            {t("henuzGrupYokBaglantilarinizdanBir", { partyWord: partyWord.toLowerCase() })}
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(groups.data ?? []).map((g) => (
              <li
                key={g.id}
                className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 transition-colors hover:border-zinc-300"
              >
                <div className="flex min-w-0 items-center gap-3">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                    <Users className="h-4 w-4" />
                  </span>
                  <div className="min-w-0">
                    <p className="truncate font-medium text-zinc-900">
                      {g.name}
                    </p>
                    <p className="mt-0.5 text-xs text-zinc-400">
                      {t("firmaTarih", { n: g.memberCount, date: formatDate(g.updatedAt, "short", locale) })}
                    </p>
                  </div>
                </div>
                {canManageTpl ? (
                <div className="flex shrink-0 items-center gap-1">
                  <Button
                    plain
                    aria-label={t("grubunuDuzenle", { name: g.name })}
                    onClick={() => setDialog({ editId: g.id })}
                  >
                    <Pencil className="h-4 w-4 text-zinc-400" />
                  </Button>
                  <Button
                    plain
                    aria-label={t("grubunuSil", { name: g.name })}
                    onClick={() =>
                      del(t("grubu"), g.name, () => deleteGroup.mutateAsync(g.id))
                    }
                  >
                    <Trash2 className="h-4 w-4 text-red-500" />
                  </Button>
                </div>
                ) : null}
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
  const tr = useTranslations("web.panel.trade.templatesView");
  const locale = useLocale() as Locale;
  // F7: şablon yazma templates:manage ister (Kurucu/Yönetici) — izinsiz
  // üye listeleri salt-okunur görür.
  const canManageTpl = useHasCompanyPermission("templates:manage");
  const questionTpls = useQuestionTemplates();
  const deleteQuestion = useDeleteQuestionTemplate();
  const del = useDeleteWithConfirm();
  const [dialog, setDialog] = useState<{ editId: string | null } | null>(null);

  return (
    <div className="space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={ListChecks}
        title={tr("soruSetleri")}
        description={tr("kalemSorulariniSetOlarakKaydedin")}
        action={
          canManageTpl ? (
            <Button onClick={() => setDialog({ editId: null })}>
              <Plus data-slot="icon" />
              {tr("yeniSet")}
            </Button>
          ) : undefined
        }
      >
        {questionTpls.isLoading ? (
          <ListSkeleton rows={3} />
        ) : (questionTpls.data ?? []).length === 0 ? (
          <EmptyHint>
            {tr("henuzSoruSetiYokMensei")}
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {(questionTpls.data ?? []).map((t) => (
              <li
                key={t.id}
                className="flex flex-col rounded-xl border border-zinc-950/10 bg-white p-4 transition-colors hover:border-zinc-300"
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                      <ListChecks className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate font-medium text-zinc-900">
                        {t.name}
                      </p>
                      <p className="mt-0.5 text-xs text-zinc-400">
                        {tr("soru", { n: t.itemCount })}
                        {t.createdAt
                          ? ` · ${formatDate(t.createdAt, "short", locale)}`
                          : ""}
                      </p>
                    </div>
                  </div>
                  {canManageTpl ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <Button
                        plain
                        aria-label={tr("setiniDuzenle", { name: t.name })}
                        onClick={() => setDialog({ editId: t.id })}
                      >
                        <Pencil className="h-4 w-4 text-zinc-400" />
                      </Button>
                      <Button
                        plain
                        aria-label={tr("setiniSil", { name: t.name })}
                        onClick={() =>
                          del(tr("soruSetini"), t.name, () =>
                            deleteQuestion.mutateAsync(t.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    </div>
                  ) : null}
                </div>
                {t.preview && t.preview.length > 0 ? (
                  <ul className="mt-3 space-y-1 border-t border-zinc-100 pt-3">
                    {t.preview.map((q, i) => (
                      <li
                        key={i}
                        className="flex items-center gap-2 text-xs text-zinc-500"
                      >
                        <span
                          className="h-1 w-1 shrink-0 rounded-full bg-zinc-300"
                          aria-hidden
                        />
                        <span className="truncate">{q}</span>
                      </li>
                    ))}
                    {t.itemCount > t.preview.length ? (
                      <li className="pl-3 text-xs text-zinc-400">
                        {tr("soruDaha", { n: t.itemCount - t.preview.length })}
                      </li>
                    ) : null}
                  </ul>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Section>
      {dialog ? (
        <QuestionTemplateDialog
          editId={dialog.editId}
          onClose={() => setDialog(null)}
        />
      ) : null}
    </div>
  );
}

/** Satın Alma Talebi Şablonları — bağımsız alt sayfa. */
export function ListingTemplatesView({ basePath }: { basePath: string }) {
  const tr = useTranslations("web.panel.trade.templatesView");
  // F7: şablon silme templates:manage ister.
  const canManageTpl = useHasCompanyPermission("templates:manage");
  const listingTpls = useListingTemplates();
  const deleteListingTpl = useDeleteTemplate();
  const del = useDeleteWithConfirm();

  // Eski satış ilanı şablonları (payload.listingType = "SATIS") listelenmez:
  // o özellik kaldırıldı (2026-09-04), şablon sihirbaza yüklenemez.
  const myListingTpls = useMemo(
    () =>
      (listingTpls.data ?? []).filter(
        (t) =>
          ((t.payload as { listingType?: string })?.listingType ?? "ALIM") ===
          "ALIM",
      ),
    [listingTpls.data],
  );

  return (
    <div className="space-y-5">
      <BackNav basePath={basePath} />
      <Section
        icon={FileText}
        title={tr("satinAlmaTalebiSablonlari")}
        description={tr("sihirbazdaSablonOlarakKaydetIle")}
      >
        {listingTpls.isLoading ? (
          <ListSkeleton rows={3} />
        ) : myListingTpls.length === 0 ? (
          <EmptyHint>
            {tr("henuzSablonYokSihirbazinUst")}
          </EmptyHint>
        ) : (
          <ul className="grid grid-cols-1 gap-3 sm:grid-cols-2">
            {myListingTpls.map((t) => {
              const p = t.payload as { title?: string; items?: unknown[] };
              return (
                <li
                  key={t.id}
                  className="flex items-start justify-between gap-3 rounded-xl border border-zinc-950/10 bg-white p-4 transition-colors hover:border-zinc-300"
                >
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-zinc-100 text-zinc-500">
                      <FileText className="h-4 w-4" />
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <p className="truncate font-medium text-zinc-900">
                          {t.name}
                        </p>
                      </div>
                      <p className="mt-0.5 truncate text-xs text-zinc-400">
                        {p.items?.length ? tr("kalem", { n: p.items.length }) : "—"}
                        {p.title ? ` · ${p.title}` : ""}
                      </p>
                    </div>
                  </div>
                  {/* C36: satırın birincil aksiyonu — şablon hızlı talepte açılır
                      (2026-09-19: sihirbaz kaldırıldı). */}
                  <div className="flex shrink-0 items-center gap-1">
                    <Link
                      href={`/company/satinalma/taleplerim/yeni?template=${t.id}`}
                      className="inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-xs font-semibold text-zinc-700 ring-1 ring-zinc-950/10 transition hover:bg-zinc-50"
                    >
                      {tr("talepteKullan")}
                    </Link>
                    {canManageTpl ? (
                      <Button
                        plain
                        aria-label={tr("sablonunuSil", { name: t.name })}
                        onClick={() =>
                          del(tr("sablonu"), t.name, () =>
                            deleteListingTpl.mutateAsync(t.id),
                          )
                        }
                      >
                        <Trash2 className="h-4 w-4 text-red-500" />
                      </Button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </Section>
    </div>
  );
}
