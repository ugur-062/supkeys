"use client";

import { entityLabels } from "@/lib/company/terms";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Send } from "lucide-react";
import { useState } from "react";

/** "Bir daha gösterme" tercihi — cihaz bazlı (localStorage). */
export const SKIP_PUBLISH_CONFIRM_KEY = "rothern-skip-publish-confirm";

export function shouldSkipPublishConfirm(): boolean {
  try {
    return localStorage.getItem(SKIP_PUBLISH_CONFIRM_KEY) === "1";
  } catch {
    return false; // SSR / erişim engeli → diyaloğu göster (güvenli taraf)
  }
}

interface Props {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void;
  invitedCount: number;
  isSubmitting: boolean;
  /** SATIS'ta davet edilen taraf ALICI'dır. */
  isSatis?: boolean;
}

export function PublishConfirmDialog({
  open,
  onClose,
  onConfirm,
  invitedCount,
  isSubmitting,
  isSatis = false,
}: Props) {
  const [dontShowAgain, setDontShowAgain] = useState(false);
  const L = entityLabels(isSatis);
  const rolDat = L.counterpartyPluralDat;
  const rolSingleDat = isSatis ? "alıcıya" : "tedarikçiye";
  const rolSingle = isSatis ? "alıcı" : "tedarikçi";
  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isSubmitting) onClose();
      }}
      size="md"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-success-50">
          <Send className="h-5 w-5 text-success-600" />
        </div>
        <div>
          <DialogTitle>{L.shortAcc} Yayınla</DialogTitle>
          <DialogDescription>{rolDat} davet gönderilecek</DialogDescription>
        </div>
      </div>

      <DialogBody className="space-y-3 text-sm text-zinc-700">
        <p>
          <strong className="text-zinc-900">{invitedCount}</strong>{" "}
          {rolSingleDat} davet e-postası gönderilecek.
        </p>
        <p className="p-3 rounded-lg bg-warning-50 border border-warning-200 text-xs text-warning-800">
          İlk teklif geldikten sonra kalemler değiştirilemez. Yayın sonrası
          yeni {rolSingle} davet edilebilir; kapanıştan önce iptal mümkündür.
        </p>
        <p className="text-xs text-zinc-500">Devam edilsin mi?</p>
        <label className="flex cursor-pointer items-center gap-2 text-xs text-zinc-600">
          <input
            type="checkbox"
            checked={dontShowAgain}
            onChange={(e) => setDontShowAgain(e.target.checked)}
            disabled={isSubmitting}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Bir daha gösterme — sonraki satın alma talepleri onaysız yayınlansın
        </label>
      </DialogBody>

      <DialogActions>
        <Button plain onClick={onClose} disabled={isSubmitting}>
          Vazgeç
        </Button>
        <Button
          onClick={() => {
            // Tercih yalnız gerçekten YAYINLA'ya basınca kalıcılaşır —
            // vazgeçilen diyalogda işaretlenmiş kutu iz bırakmaz.
            if (dontShowAgain) {
              try {
                localStorage.setItem(SKIP_PUBLISH_CONFIRM_KEY, "1");
              } catch {
                // localStorage kapalıysa tercih kaydedilmez, diyalog çıkmaya devam eder
              }
            }
            onConfirm();
          }}
          disabled={isSubmitting}
        >
          <Send data-slot="icon" />
          Yayınla
        </Button>
      </DialogActions>
    </Dialog>
  );
}
