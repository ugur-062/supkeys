"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { CheckCircle2 } from "lucide-react";
import { useEffect, useState } from "react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: (note: string) => void;
  loading: boolean;
  orderNumber: string;
}

const NOTE_MAX = 500;

export function CompleteOrderModal({
  open,
  onClose,
  onConfirm,
  loading,
  orderNumber,
}: Props) {
  const [note, setNote] = useState("");

  useEffect(() => {
    if (open) setNote("");
  }, [open]);

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Teslim Aldım</DialogTitle>
      <DialogDescription>{orderNumber} tamamlanıyor</DialogDescription>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          onConfirm(note.trim());
        }}
      >
        <DialogBody className="space-y-4">
          <Alert variant="success">
            Bu siparişi teslim aldığınızı onaylıyorsunuz. Sipariş tamamlanmış
            olarak işaretlenecek ve tedarikçiye e-posta gönderilecek.
          </Alert>

          <Field>
            <div className="mb-1.5 flex items-center justify-between">
              <Label htmlFor="complete-note" className="mb-0">
                Notunuz (opsiyonel)
              </Label>
              <span className="text-xs tabular-nums text-zinc-400">
                {note.length} / {NOTE_MAX}
              </span>
            </div>
            <Textarea
              id="complete-note"
              rows={3}
              value={note}
              onChange={(e) => setNote(e.target.value.slice(0, NOTE_MAX))}
              placeholder="Örn. Tüm kalemler eksiksiz teslim alındı."
            />
          </Field>
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={loading}
          >
            Vazgeç
          </Button>
          <Button type="submit" loading={loading} disabled={loading}>
            <CheckCircle2 className="h-4 w-4" />
            Teslim Aldım
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
