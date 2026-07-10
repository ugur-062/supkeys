"use client";

import { Button } from "@/components/ui/button";
import { useNotifyCompany } from "@/hooks/use-admin-support";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

/** Tek firmaya panelden bildirim + e-posta — "aradı, bilgi verdik" akışı. */
export function NotifyDialog({
  companyId,
  onClose,
}: {
  companyId: string;
  onClose: () => void;
}) {
  const notify = useNotifyCompany(companyId);
  const [subject, setSubject] = useState("");
  const [message, setMessage] = useState("");

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 px-4 pt-24"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
      aria-label="Bildirim gönder"
    >
      <div
        className="bg-admin-surface w-full max-w-md rounded-2xl shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="border-admin-border flex items-center justify-between border-b px-5 py-3.5">
          <h2 className="text-admin-text text-base font-bold">
            Firmaya Bildirim Gönder
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="hover:bg-admin-border/40 rounded-lg p-1"
            aria-label="Kapat"
          >
            <X className="text-admin-text-muted h-4 w-4" />
          </button>
        </div>
        <div className="space-y-3 px-5 py-4">
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              Konu
            </span>
            <input
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              placeholder="Örn. Belgeleriniz hakkında"
              className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-1.5 text-sm"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-admin-text-muted text-xs font-medium">
              Mesaj
            </span>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Firma yetkilisine iletilecek mesaj..."
              className="border-admin-border bg-admin-surface text-admin-text rounded-lg border px-3 py-2 text-sm"
            />
          </label>
          <p className="text-admin-text-muted text-xs">
            Uygulama içi bildirim + e-posta olarak gider; denetim kaydına
            yazılır.
          </p>
        </div>
        <div className="border-admin-border flex items-center justify-end gap-2 border-t px-5 py-3">
          <Button variant="ghost" onClick={onClose}>
            Vazgeç
          </Button>
          <Button
            loading={notify.isPending}
            disabled={subject.trim().length < 3 || message.trim().length < 3}
            onClick={() =>
              notify.mutate(
                { subject: subject.trim(), message: message.trim() },
                {
                  onSuccess: () => {
                    toast.success("Bildirim gönderildi");
                    onClose();
                  },
                  onError: (e: unknown) =>
                    toast.error(e instanceof Error ? e.message : "Hata"),
                },
              )
            }
          >
            Gönder
          </Button>
        </div>
      </div>
    </div>
  );
}
