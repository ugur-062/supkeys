"use client";

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
import { useEliminateBid } from "@/hooks/use-tenant-tenders";
import { extractErrorMessage } from "@/lib/tenders/error";
import { AlertTriangle, Ban } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
  tenderId: string;
  bidId: string;
  supplierName: string;
}

export function EliminateBidModal({
  open,
  onClose,
  tenderId,
  bidId,
  supplierName,
}: Props) {
  const [reason, setReason] = useState("");
  const mutation = useEliminateBid(tenderId);

  const reasonValid = reason.trim().length >= 10 && reason.trim().length <= 500;

  const handleClose = () => {
    if (!mutation.isPending) {
      setReason("");
      onClose();
    }
  };

  const handleConfirm = async () => {
    if (!reasonValid) return;
    try {
      await mutation.mutateAsync({ bidId, reason: reason.trim() });
      toast.success("Teklif elendi, tedarikçiye bildirim gönderildi");
      setReason("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Eleme başarısız"));
    }
  };

  return (
    <Dialog open={open} onClose={handleClose} size="lg">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-danger-50">
          <Ban className="h-5 w-5 text-danger-600" />
        </div>
        <div>
          <DialogTitle className="text-danger-700">Teklifi Ele</DialogTitle>
          <DialogDescription>
            <span className="font-semibold">{supplierName}</span> firmasının
            teklifini elemek üzeresiniz.
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-xs text-warning-800 flex gap-2">
          <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
          <span>
            Bu işlem sonrası tedarikçiye e-posta ile bildirim gönderilir ve
            yeniden teklif verme hakkı kazanır.
          </span>
        </div>

        <Field
          hint={`${reason.length} / 500 — Bu sebep tedarikçiye e-postada gösterilir.`}
        >
          <Label htmlFor="elimination-reason">
            Eleme Sebebi <span className="text-danger-500">*</span>
          </Label>
          <Textarea
            id="elimination-reason"
            rows={4}
            maxLength={500}
            placeholder="Örn. Vergi levhası eksik, ürün spesifikasyonu uyumsuz…"
            value={reason}
            onChange={(e) => setReason(e.target.value)}
            disabled={mutation.isPending}
          />
        </Field>

        <p className="text-xs text-zinc-500">Minimum 10 karakter zorunludur.</p>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={handleClose} disabled={mutation.isPending}>
          Vazgeç
        </Button>
        <Button
          color="red"
          onClick={handleConfirm}
          disabled={!reasonValid || mutation.isPending}
        >
          <Ban data-slot="icon" />
          Teklifi Ele
        </Button>
      </DialogActions>
    </Dialog>
  );
}
