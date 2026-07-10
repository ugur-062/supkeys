"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useNotifyCompany } from "@/hooks/use-admin-support";
import { useState } from "react";
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

  return (
    <Dialog open onClose={onClose} size="md" aria-label="Bildirim gönder">
      <DialogTitle>Firmaya Bildirim Gönder</DialogTitle>
      <DialogDescription>
        Uygulama içi bildirim ve e-posta olarak iletilir; denetim kaydına
        yazılır.
      </DialogDescription>
      <DialogBody className="space-y-4">
        <Field>
          <Label htmlFor="notify-subject">Konu</Label>
          <Input
            id="notify-subject"
            value={subject}
            onChange={(e) => setSubject(e.target.value)}
            placeholder="Örn. Belgeleriniz hakkında"
          />
        </Field>
        <Field>
          <Label htmlFor="notify-message">Mesaj</Label>
          <Textarea
            id="notify-message"
            value={message}
            onChange={(e) => setMessage(e.target.value)}
            rows={4}
            placeholder="Firma yetkilisine iletilecek mesaj..."
          />
        </Field>
      </DialogBody>
      <DialogActions>
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
      </DialogActions>
    </Dialog>
  );
}
