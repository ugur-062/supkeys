"use client";

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
import { useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onSave: (name: string) => void;
  isSaving: boolean;
  defaultName?: string;
}

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
  const [name, setName] = useState(defaultName ?? "");
  const trimmed = name.trim();
  const canSave = trimmed.length >= 2;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isSaving) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50">
          <BookmarkPlus className="h-5 w-5 text-brand-600" />
        </div>
        <div>
          <DialogTitle>Şablon olarak kaydet</DialogTitle>
          <DialogDescription>
            Bu ihaleyi tekrar kullanmak üzere şablonlayın
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3">
        <Field>
          <Label>Şablon adı</Label>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            maxLength={100}
            placeholder="Ör. Aylık ofis malzemesi"
            onKeyDown={(e) => {
              if (e.key === "Enter" && canSave && !isSaving) onSave(trimmed);
            }}
          />
        </Field>
        <p className="text-xs text-zinc-500">
          Kalemler, kategoriler ve ayarlar şablona dahil edilir. Kapanış tarihi
          ve davetli tedarikçiler her ihalede yeniden seçilir.
        </p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSaving}>
          Vazgeç
        </Button>
        <Button onClick={() => onSave(trimmed)} disabled={!canSave || isSaving}>
          <BookmarkPlus data-slot="icon" />
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
