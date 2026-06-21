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
import { useBlockSupplier } from "@/hooks/use-tenant-suppliers";
import axios from "axios";
import { Ban } from "lucide-react";
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
    <Dialog open={open} onClose={onClose} size="md">
      <form onSubmit={handleSubmit}>
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-danger-50">
            <Ban className="h-5 w-5 text-danger-600" />
          </div>
          <div className="min-w-0">
            <DialogTitle>Tedarikçiyi Engelle</DialogTitle>
            <DialogDescription className="truncate">
              {companyName} engelleniyor
            </DialogDescription>
          </div>
        </div>

        <DialogBody className="space-y-4">
          <div className="rounded-lg bg-warning-50 border border-warning-200 p-3 text-sm">
            <p className="font-semibold text-warning-700">
              ⚠️ Engellendiğinde:
            </p>
            <ul className="list-disc list-inside text-xs text-warning-700/90 mt-1 space-y-0.5">
              <li>Bu tedarikçi ihalelerinize teklif veremez</li>
              <li>
                Tedarikçi havuzunda görünmeye devam eder ama davetinize cevap
                veremez
              </li>
              <li>İstediğiniz zaman engeli kaldırabilirsiniz</li>
            </ul>
          </div>

          <Field error={reasonError ?? undefined}>
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="block-reason" className="mb-0" required>
                Engelleme Sebebi
              </Label>
              <span className="text-xs text-zinc-400 tabular-nums">
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
            <p className="text-xs text-zinc-500 mt-1">
              Bu sebep tedarikçiye gösterilmez, sadece şirket içinde kayıt
              amaçlıdır.
            </p>
          </Field>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={block.isPending}>
            Vazgeç
          </Button>
          <Button type="submit" color="red" disabled={block.isPending}>
            <Ban data-slot="icon" />
            Engelle
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
