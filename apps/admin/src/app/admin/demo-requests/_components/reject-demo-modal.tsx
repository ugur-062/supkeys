"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateDemoRequest } from "@/hooks/use-demo-requests";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import axios from "axios";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface RejectDemoModalProps {
  demoId: string;
  companyName: string;
  open: boolean;
  onClose: () => void;
}

type Reason = "spam" | "not_interested" | "other";

const REASONS: { value: Reason; label: string; hint: string }[] = [
  {
    value: "spam",
    label: "Spam veya Sahte Talep",
    hint: "Talep gerçek değil; herhangi bir takip yapılmayacak.",
  },
  {
    value: "not_interested",
    label: "Demo gerçekleşti, ilgilenmediler",
    hint: "Görüşme yapıldı fakat müşteri devam etmedi.",
  },
  {
    value: "other",
    label: "Diğer (sebep yazın)",
    hint: "Aşağıya kısa bir açıklama bırakın.",
  },
];

const NOTE_MAX = 500;

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function RejectDemoModal({
  demoId,
  companyName,
  open,
  onClose,
}: RejectDemoModalProps) {
  const [reason, setReason] = useState<Reason>("spam");
  const [note, setNote] = useState("");
  const [noteError, setNoteError] = useState<string | null>(null);
  const update = useUpdateDemoRequest(demoId);

  // Modal her açıldığında değerleri sıfırla
  useEffect(() => {
    if (open) {
      setReason("spam");
      setNote("");
      setNoteError(null);
    }
  }, [open]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();

    let status: DemoRequestStatus;
    let closedReason: string;

    if (reason === "spam") {
      status = "SPAM";
      closedReason = "";
    } else if (reason === "not_interested") {
      status = "LOST";
      closedReason = "NOT_INTERESTED";
    } else {
      const trimmed = note.trim();
      if (!trimmed) {
        setNoteError("Sebep gerekli");
        return;
      }
      status = "LOST";
      closedReason = trimmed;
    }

    update.mutate(
      { status, closedReason },
      {
        onSuccess: () => {
          toast.success("Talep reddedildi");
          onClose();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Talep reddedilemedi")),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>Talebi Reddet</DialogTitle>
      <DialogDescription>
        <span className="font-medium text-zinc-950">{companyName}</span> talebi
        reddediliyor
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <RadioGroup
            value={reason}
            onChange={(v) => {
              setReason(v as Reason);
              setNoteError(null);
            }}
            className="space-y-2"
            aria-label="Red sebebi"
          >
            {REASONS.map((r) => (
              <label
                key={r.value}
                className="flex cursor-pointer items-start gap-3 rounded-lg border border-zinc-950/10 p-3 transition-colors hover:bg-zinc-50 has-data-checked:border-zinc-950 has-data-checked:bg-zinc-50"
              >
                <Radio value={r.value} className="mt-0.5 shrink-0" />
                <span className="text-sm">
                  <span className="block font-medium text-zinc-900">
                    {r.label}
                  </span>
                  <span className="mt-0.5 block text-xs text-zinc-500">
                    {r.hint}
                  </span>
                </span>
              </label>
            ))}
          </RadioGroup>

          {reason === "other" && (
            <div className="space-y-1">
              <Label htmlFor="reject-note" required>
                Sebep
              </Label>
              <Textarea
                id="reject-note"
                value={note}
                onChange={(e) => {
                  setNote(e.target.value.slice(0, NOTE_MAX));
                  if (noteError) setNoteError(null);
                }}
                placeholder="Örn: Müşteri başka bir platform tercih etti"
                rows={4}
                hasError={!!noteError}
              />
              <div className="flex items-center justify-between text-xs">
                {noteError ? (
                  <span className="text-danger-600">{noteError}</span>
                ) : (
                  <span className="text-zinc-500">
                    Kapanış kaydında saklanır.
                  </span>
                )}
                <span className="text-zinc-500 tabular-nums">
                  {note.length} / {NOTE_MAX}
                </span>
              </div>
            </div>
          )}
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={onClose}
            disabled={update.isPending}
          >
            İptal
          </Button>
          <Button
            type="submit"
            variant="danger"
            loading={update.isPending}
            disabled={update.isPending}
          >
            Reddet
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
