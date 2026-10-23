"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { useDialogSubmitLock } from "@/hooks/use-submit-lock";

interface ConfirmDialogProps {
  open: boolean;
  title: string;
  /** Ne olacağı — kısa, somut (kim etkilenir, geri alınabilir mi). */
  children: React.ReactNode;
  confirmLabel: string;
  /** Yıkıcı işlemde kırmızı onay düğmesi. */
  danger?: boolean;
  /**
   * Onay — tek seferlik. Promise dönerse o çözülene dek düğme kilitli;
   * diyaloğu başarıda çağıran kapatır (hata dalında açık kalabilir).
   */
  onConfirm: () => unknown;
  onClose: () => void;
}

/**
 * Tek tıkla geri dönüşü zahmetli işlemler için kısa onay penceresi
 * (kullanıcıyı devre dışı bırakma, oturum düşürme, davet iptali — arayüz
 * testi D-209; doğrulamayı geri alan belge reddi — D-191).
 */
export function ConfirmDialog({
  open,
  title,
  children,
  confirmLabel,
  danger = false,
  onConfirm,
  onClose,
}: ConfirmDialogProps) {
  const lock = useDialogSubmitLock(open);
  return (
    <Dialog open={open} onClose={onClose} size="sm" aria-label={title}>
      <DialogTitle>{title}</DialogTitle>
      <DialogBody>
        <div className="text-admin-text space-y-2 text-sm">{children}</div>
      </DialogBody>
      <DialogActions>
        <Button type="button" variant="ghost" onClick={onClose}>
          Vazgeç
        </Button>
        <Button
          type="button"
          variant={danger ? "danger" : "primary"}
          disabled={lock.locked}
          onClick={() => {
            void lock.run(() => onConfirm()).catch(() => {});
          }}
        >
          {confirmLabel}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
