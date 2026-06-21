"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { AlertTriangle, Timer } from "lucide-react";

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  isSubmitting: boolean;
  tenderTitle: string;
  submittedBidCount: number;
}

export function CloseBiddingEarlyDialog({
  open,
  onClose,
  onConfirm,
  isSubmitting,
  tenderTitle,
  submittedBidCount,
}: Props) {
  const hasBids = submittedBidCount > 0;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-100">
          <Timer className="h-5 w-5 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <DialogTitle>İhaleyi Erken Kapat</DialogTitle>
          <DialogDescription className="truncate">
            {tenderTitle}
          </DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-4">
        <p className="text-sm text-zinc-700">
          Süreyi beklemeden ihaleyi kapatıp kazandırma aşamasına geçeceksiniz.
        </p>

        <div className="rounded-lg bg-zinc-50 ring-1 ring-zinc-950/5 p-3 text-sm">
          <p className="text-zinc-700">
            <strong className="font-mono tabular-nums">
              {submittedBidCount}
            </strong>{" "}
            gönderilmiş teklif var.
          </p>
          <ul className="mt-2 text-xs text-zinc-600 list-disc list-inside space-y-0.5">
            <li>Açık davetler iptal edilir (EXPIRED).</li>
            <li>Tedarikçilere ihalenin kapandığı e-postası gönderilir.</li>
            <li>İhale IN_AWARD durumuna geçer.</li>
          </ul>
        </div>

        {!hasBids ? (
          <div className="flex items-start gap-2 p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-800">
            <AlertTriangle className="w-4 h-4 flex-shrink-0 mt-0.5" />
            <p>
              Henüz hiç teklif gelmedi. Yine de kapatabilirsiniz; ardından
              &quot;Kazanan Yok Kapat&quot; ile ihaleyi sonlandırabilirsiniz.
            </p>
          </div>
        ) : null}
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button onClick={onConfirm} disabled={isSubmitting}>
          <Timer data-slot="icon" />
          Kapat ve Kazandır
        </Button>
      </DialogActions>
    </Dialog>
  );
}
