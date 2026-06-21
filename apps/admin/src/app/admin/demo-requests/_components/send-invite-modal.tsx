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
import { useSendDemoInvite } from "@/hooks/use-demo-requests";
import axios from "axios";
import { Info } from "lucide-react";
import { useEffect, useState } from "react";
import { toast } from "sonner";

interface SendInviteModalProps {
  demoId: string;
  defaultEmail: string;
  companyName: string;
  isResend: boolean;
  open: boolean;
  onClose: () => void;
}

const MESSAGE_MAX = 500;

function getErrorMessage(err: unknown, fallback: string) {
  if (axios.isAxiosError(err)) {
    const data = err.response?.data as { message?: string | string[] } | undefined;
    if (Array.isArray(data?.message)) return data.message.join(", ");
    return data?.message ?? fallback;
  }
  return fallback;
}

export function SendInviteModal({
  demoId,
  defaultEmail,
  companyName,
  isResend,
  open,
  onClose,
}: SendInviteModalProps) {
  const [email, setEmail] = useState(defaultEmail);
  const [message, setMessage] = useState("");
  const [emailError, setEmailError] = useState<string | undefined>();
  const send = useSendDemoInvite(demoId);

  // Modal her açıldığında değerleri tazele
  useEffect(() => {
    if (open) {
      setEmail(defaultEmail);
      setMessage("");
      setEmailError(undefined);
    }
  }, [open, defaultEmail]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = email.trim();
    if (!trimmed || !trimmed.includes("@")) {
      setEmailError("Geçerli bir e-posta giriniz");
      return;
    }
    setEmailError(undefined);

    send.mutate(
      {
        email: trimmed,
        message: message.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Davet gönderildi");
          onClose();
        },
        onError: (err) =>
          toast.error(getErrorMessage(err, "Davet gönderilemedi")),
      },
    );
  };

  return (
    <Dialog open={open} onClose={onClose} size="md">
      <DialogTitle>
        {isResend ? "Daveti Yeniden Gönder" : "Kayıt Daveti Gönder"}
      </DialogTitle>
      <DialogDescription>
        <span className="font-medium text-zinc-950">{companyName}</span> için
        kayıt linki içeren e-posta gönderilecek
      </DialogDescription>
      <form onSubmit={handleSubmit}>
        <DialogBody className="space-y-4">
          <Field error={emailError}>
            <Label htmlFor="invite-email" required>
              E-posta
            </Label>
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ornek@firma.com"
              hasError={!!emailError}
              autoFocus
            />
          </Field>

          <div className="space-y-1">
            <Label htmlFor="invite-message">Mesaj</Label>
            <Textarea
              id="invite-message"
              value={message}
              onChange={(e) => setMessage(e.target.value.slice(0, MESSAGE_MAX))}
              placeholder="Ali Bey, görüşmemizin ardından hesabınızı oluşturmanızı bekliyoruz."
              rows={4}
            />
            <div className="flex items-center justify-between text-xs text-zinc-500 mt-1">
              <span>Opsiyonel kişisel not</span>
              <span className="tabular-nums">
                {message.length} / {MESSAGE_MAX}
              </span>
            </div>
          </div>

          <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-zinc-50 border border-zinc-200">
            <Info className="w-4 h-4 text-zinc-600 shrink-0 mt-0.5" />
            <p className="text-xs text-zinc-700 leading-relaxed">
              Bu davet bağlantısı <strong>14 gün</strong> boyunca geçerli olacak.
              Müşteri kayıt formunu doldurup e-postasını doğruladığında başvuru{" "}
              <strong>incelemeye</strong> düşer — ardından admin panelden manuel
              onay vereceksiniz.
            </p>
          </div>
        </DialogBody>
        <DialogActions>
          <Button type="button" variant="ghost" onClick={onClose}>
            İptal
          </Button>
          <Button
            type="submit"
            loading={send.isPending}
            disabled={send.isPending}
          >
            {isResend ? "Yeniden Gönder" : "Daveti Gönder"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
