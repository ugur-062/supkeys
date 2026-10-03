"use client";

import { useTranslations } from "next-intl";
import { useEntityLabels } from "@/i18n/domain";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { BookmarkPlus } from "lucide-react";
import { useEffect, useState } from "react";
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";

interface Props {
  open: boolean;
  onClose: () => void;
  /** İş bitince çözülen promise döner; o süre ve kapanışta düğme kilitlidir. */
  onSave: (name: string) => unknown;
  isSaving: boolean;
  defaultName?: string;
}

/** Şablon adı tavanı — API `SaveTemplateDto.name` 120; arayüz 100 ile kalır. */
const TEMPLATE_NAME_MAX = 100;

/**
 * Madde 34 — Mevcut ihale formunu isimli şablon olarak kaydetme dialog'u.
 * Kapanış tarihi + davetli tedarikçiler şablona girmez (kaydederken çıkarılır).
 */
export function SaveTemplateDialog({
  open,
  onClose,
  onSave,
  isSaving,
  defaultName,
}: Props) {
  const t = useTranslations("web.panel.requests.saveTemplateDialog");
  const L = useEntityLabels();
  // Varsayılan ad talep başlığıdır (200 karaktere kadar); `maxLength` yalnız
  // klavyeyi sınırlar → programatik değer burada kırpılır, aksi hâlde uzun
  // başlıkta doğrudan "Kaydet" API'de 400 alıyordu (derin denetim S085).
  const initialName = (defaultName ?? "").trim().slice(0, TEMPLATE_NAME_MAX);
  const [name, setName] = useState(initialName);
  // Dialog hep mount olduğundan ilk-state bayatlar: açılışta güncel başlıkla doldur.
  useEffect(() => {
    if (open) setName(initialName);
  }, [open, initialName]);
  const trimmed = name.trim();
  const canSave = trimmed.length >= 2;
  // Çift tık / Enter basılı tutmak kopya şablon açmasın (arayüz testi FX-00 D-041).
  const lock = useDialogSubmitLock(open);
  const busy = isSaving || lock.locked;
  const save = () => {
    if (!canSave) return;
    void lock.run(() => onSave(trimmed)).catch(() => {});
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <BookmarkPlus className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <DialogTitle>{t("sablonOlarakKaydet")}</DialogTitle>
          <DialogDescription>
            {t("buTekrarKullanmakUzereSablonlayin", { acc: L.acc })}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3">
        <Field>
          <Label>{t("sablonAdi")}</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={TEMPLATE_NAME_MAX}
            placeholder={t("orAylikOfisMalzemesi")}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !busy) save();
            }}
          />
        </Field>
        <p className="text-xs text-zinc-500">
          {t("kalemlerKategorilerVeAyarlarSablona", { counterpartyPluralLower: L.counterpartyPluralLower, loc: L.loc })}
        </p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={busy}>
          {t("vazgec")}
        </Button>
        <Button onClick={save} disabled={!canSave || busy}>
          <BookmarkPlus data-slot="icon" />
          {t("kaydet")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
