"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useRejectRelation } from "@/hooks/use-tenant-suppliers";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { X, XCircle } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RejectRelationModalProps {
  relationId: string;
  supplierName: string;
  open: boolean;
  onClose: () => void;
}

const REASON_MAX = 500;

function getErrorMessage(err: unknown, fallback: string): string {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as
      | { message?: string | string[] }
      | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function RejectRelationModal({
  relationId,
  supplierName,
  open,
  onClose,
}: RejectRelationModalProps) {
  const [reason, setReason] = useState("");
  const reject = useRejectRelation(relationId);

  useEffect(() => {
    if (open) setReason("");
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    reject.mutate(
      { reason: reason.trim() || undefined },
      {
        onSuccess: () => {
          toast.success("Talep reddedildi, tedarikçiye e-posta gönderildi");
          onClose();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Talep reddedilemedi")),
      },
    );
  };

  return (
    <Dialog.Root
      open={open}
      onOpenChange={(o) => {
        if (!o) onClose();
      }}
    >
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="w-10 h-10 rounded-full bg-danger-50 flex items-center justify-center shrink-0">
                <XCircle className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Bağlantı Talebini Reddet
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {supplierName}
                </Dialog.Description>
              </div>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-slate-400 hover:text-slate-600 transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <Field>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="reject-reason" className="mb-0">
                  Sebep (opsiyonel)
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {reason.length} / {REASON_MAX}
                </span>
              </div>
              <Textarea
                id="reject-reason"
                rows={3}
                value={reason}
                onChange={(e) =>
                  setReason(e.target.value.slice(0, REASON_MAX))
                }
                placeholder="Tedarikçiye iletilecek kısa bir not (isteğe bağlı)"
              />
              <p className="text-xs text-slate-500 mt-1">
                Boş bırakırsanız tedarikçiye &ldquo;Alıcı tarafından
                reddedildi&rdquo; mesajı gönderilir.
              </p>
            </Field>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={reject.isPending}
              >
                İptal
              </Button>
              <Button
                type="submit"
                loading={reject.isPending}
                disabled={reject.isPending}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
              >
                <XCircle className="w-4 h-4" />
                Reddet
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
