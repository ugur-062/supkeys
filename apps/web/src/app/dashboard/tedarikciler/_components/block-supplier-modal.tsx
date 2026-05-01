"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useBlockSupplier } from "@/hooks/use-tenant-suppliers";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { Ban, X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface BlockSupplierModalProps {
  relationId: string;
  companyName: string;
  open: boolean;
  onClose: () => void;
  onBlocked?: () => void;
}

const REASON_MIN = 10;
const REASON_MAX = 500;

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function BlockSupplierModal({
  relationId,
  companyName,
  open,
  onClose,
  onBlocked,
}: BlockSupplierModalProps) {
  const [reason, setReason] = useState("");
  const [reasonError, setReasonError] = useState<string | null>(null);
  const block = useBlockSupplier(relationId);

  useEffect(() => {
    if (open) {
      setReason("");
      setReasonError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = reason.trim();
    if (trimmed.length < REASON_MIN) {
      setReasonError(`Sebep en az ${REASON_MIN} karakter olmalı`);
      return;
    }
    block.mutate(
      { reason: trimmed },
      {
        onSuccess: () => {
          toast.success("Tedarikçi engellendi");
          onBlocked?.();
          onClose();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Tedarikçi engellenemedi")),
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
                <Ban className="w-5 h-5 text-danger-600" />
              </div>
              <div className="min-w-0">
                <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                  Tedarikçiyi Engelle
                </Dialog.Title>
                <Dialog.Description className="text-sm text-slate-500 truncate">
                  {companyName} engelleniyor
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
            <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm">
              <p className="font-semibold text-warning-700">
                ⚠️ Engellendiğinde:
              </p>
              <ul className="list-disc list-inside text-xs text-warning-700/90 mt-1 space-y-0.5">
                <li>Bu tedarikçi ihalelerinize teklif veremez</li>
                <li>
                  Tedarikçi havuzunda görünmeye devam eder ama davetinize
                  cevap veremez
                </li>
                <li>İstediğiniz zaman engeli kaldırabilirsiniz</li>
              </ul>
            </div>

            <Field error={reasonError ?? undefined}>
              <div className="flex items-center justify-between mb-1.5">
                <Label htmlFor="block-reason" className="mb-0" required>
                  Engelleme Sebebi
                </Label>
                <span className="text-xs text-slate-400 tabular-nums">
                  {reason.length} / {REASON_MAX}
                </span>
              </div>
              <Textarea
                id="block-reason"
                rows={4}
                value={reason}
                onChange={(e) => {
                  setReason(e.target.value.slice(0, REASON_MAX));
                  if (reasonError) setReasonError(null);
                }}
                placeholder="Performans yetersizliği, iletişim problemleri vb."
                hasError={!!reasonError}
              />
              <p className="text-xs text-slate-500 mt-1">
                Bu sebep tedarikçiye gösterilmez, sadece şirket içinde kayıt
                amaçlıdır.
              </p>
            </Field>

            <footer className="flex items-center gap-2 pt-1">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={block.isPending}
              >
                Vazgeç
              </Button>
              <Button
                type="submit"
                loading={block.isPending}
                disabled={block.isPending}
                className="flex-1 !bg-danger-600 hover:!bg-danger-700 focus:!ring-danger-500"
              >
                <Ban className="w-4 h-4" />
                Engelle
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
