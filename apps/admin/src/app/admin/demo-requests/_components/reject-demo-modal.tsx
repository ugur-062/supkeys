"use client";

import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useUpdateDemoRequest } from "@/hooks/use-demo-requests";
import type { DemoRequestStatus } from "@/lib/demo-requests/types";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { X } from "lucide-react";
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
            "w-full max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-admin-border flex items-start justify-between gap-3">
            <div>
              <Dialog.Title className="font-display font-bold text-lg text-admin-text">
                Talebi Reddet
              </Dialog.Title>
              <Dialog.Description className="text-sm text-admin-text-muted mt-0.5">
                <span className="font-medium text-admin-text">
                  {companyName}
                </span>{" "}
                talebi reddediliyor
              </Dialog.Description>
            </div>
            <Dialog.Close asChild>
              <button
                aria-label="Kapat"
                className="p-1.5 rounded-lg hover:bg-surface-muted text-admin-text-muted hover:text-admin-text transition-colors shrink-0"
              >
                <X className="w-4 h-4" />
              </button>
            </Dialog.Close>
          </header>

          <form onSubmit={handleSubmit} className="px-5 py-5 space-y-4">
            <fieldset className="space-y-2">
              <legend className="text-sm font-medium text-admin-text mb-1">
                Red sebebi
              </legend>
              {REASONS.map((r) => {
                const selected = reason === r.value;
                return (
                  <label
                    key={r.value}
                    className={cn(
                      "flex items-start gap-3 p-3 rounded-lg border cursor-pointer transition-colors",
                      selected
                        ? "border-brand-500 bg-brand-50/40"
                        : "border-admin-border hover:bg-surface-muted",
                    )}
                  >
                    <input
                      type="radio"
                      name="reject-reason"
                      value={r.value}
                      checked={selected}
                      onChange={() => {
                        setReason(r.value);
                        setNoteError(null);
                      }}
                      className="mt-0.5 w-4 h-4 text-brand-600 focus:ring-brand-500/30 border-slate-300"
                    />
                    <span className="text-sm">
                      <span
                        className={cn(
                          "font-medium block",
                          selected ? "text-brand-900" : "text-admin-text",
                        )}
                      >
                        {r.label}
                      </span>
                      <span className="text-xs text-admin-text-muted mt-0.5 block">
                        {r.hint}
                      </span>
                    </span>
                  </label>
                );
              })}
            </fieldset>

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
                  className="min-h-[90px]"
                  hasError={!!noteError}
                />
                <div className="flex items-center justify-between text-xs">
                  {noteError ? (
                    <span className="text-danger-600">{noteError}</span>
                  ) : (
                    <span className="text-admin-text-muted">
                      Kapanış kaydında saklanır.
                    </span>
                  )}
                  <span className="text-admin-text-muted tabular-nums">
                    {note.length} / {NOTE_MAX}
                  </span>
                </div>
              </div>
            )}

            <footer className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
                disabled={update.isPending}
              >
                İptal
              </Button>
              <Button
                type="submit"
                variant="danger"
                loading={update.isPending}
                disabled={update.isPending}
                className="flex-1"
              >
                Reddet
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
