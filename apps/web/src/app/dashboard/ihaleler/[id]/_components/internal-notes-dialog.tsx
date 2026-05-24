"use client";

// V2-7+ — "Not Al" — alıcı dahili notu kaydet/güncelle modal'ı.
// Tedarikçilere görünmez. Sadece tenant ekibi okur.

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateTenderNotes } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Lock, NotebookPen, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
  initialNotes: string | null;
}

const MAX_LEN = 5000;

export function InternalNotesDialog({
  open,
  onClose,
  tenderId,
  initialNotes,
}: Props) {
  const [notes, setNotes] = useState<string>(initialNotes ?? "");
  const mutation = useUpdateTenderNotes(tenderId);

  // Modal her açılışta serverdan gelen son değerle senkronize ol
  useEffect(() => {
    if (open) setNotes(initialNotes ?? "");
  }, [open, initialNotes]);

  const handleClose = () => {
    if (mutation.isPending) return;
    onClose();
  };

  const dirty = (notes.trim() || null) !== (initialNotes?.trim() || null);
  const overLimit = notes.length > MAX_LEN;

  const handleSubmit = async () => {
    if (overLimit) return;
    try {
      await mutation.mutateAsync(notes);
      toast.success("Not kaydedildi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Not kaydedilemedi"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-lg bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <NotebookPen className="w-5 h-5 text-brand-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Not Al
                </Dialog.Title>
                <Dialog.Description className="text-xs text-slate-500 flex items-center gap-1 mt-0.5">
                  <Lock className="w-3 h-3" />
                  Sadece sizin ekibiniz görür — tedarikçilere yansımaz
                </Dialog.Description>
              </div>
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

          <div className="px-5 py-5">
            <Field
              error={overLimit ? `En fazla ${MAX_LEN} karakter` : undefined}
              hint={`${notes.length} / ${MAX_LEN} karakter`}
            >
              <Label htmlFor="internal-notes" className="sr-only">
                İhale Notu
              </Label>
              <Textarea
                id="internal-notes"
                rows={8}
                placeholder="Ör. Tedarikçi X ile bugün görüştüm, fiyat indirebileceğini söyledi. Y kalemleri için alternatif marka da kabul edilebilir."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                hasError={overLimit}
              />
            </Field>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!dirty || overLimit || mutation.isPending}
              loading={mutation.isPending}
            >
              Kaydet
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
