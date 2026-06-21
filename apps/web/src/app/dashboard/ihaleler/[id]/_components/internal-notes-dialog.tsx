"use client";

// V2-7+ — "Not Al" — alıcı dahili notu kaydet/güncelle modal'ı.
// Tedarikçilere görünmez. Sadece tenant ekibi okur.

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateTenderNotes } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Lock, NotebookPen } from "lucide-react";
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
    <Dialog open={open} onClose={handleClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <NotebookPen className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>Not Al</DialogTitle>
          <DialogDescription className="flex items-center gap-1">
            <Lock className="w-3 h-3" />
            Sadece sizin ekibiniz görür — tedarikçilere yansımaz
          </DialogDescription>
        </div>
      </div>

      <DialogBody>
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
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={mutation.isPending}>
          Vazgeç
        </Button>
        <Button
          onClick={handleSubmit}
          disabled={!dirty || overLimit || mutation.isPending}
        >
          Kaydet
        </Button>
      </DialogActions>
    </Dialog>
  );
}
