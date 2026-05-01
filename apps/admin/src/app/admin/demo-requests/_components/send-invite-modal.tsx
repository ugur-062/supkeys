"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { useSendDemoInvite } from "@/hooks/use-demo-requests";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import axios from "axios";
import { Info, X } from "lucide-react";
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
                {isResend ? "Daveti Yeniden Gönder" : "Kayıt Daveti Gönder"}
              </Dialog.Title>
              <Dialog.Description className="text-sm text-admin-text-muted mt-0.5">
                <span className="font-medium text-admin-text">
                  {companyName}
                </span>{" "}
                için kayıt linki içeren e-posta gönderilecek
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
                onChange={(e) =>
                  setMessage(e.target.value.slice(0, MESSAGE_MAX))
                }
                placeholder="Ali Bey, görüşmemizin ardından hesabınızı oluşturmanızı bekliyoruz."
                className="min-h-[100px]"
              />
              <div className="flex items-center justify-between text-xs text-admin-text-muted mt-1">
                <span>Opsiyonel kişisel not</span>
                <span className="tabular-nums">
                  {message.length} / {MESSAGE_MAX}
                </span>
              </div>
            </div>

            <div className="flex items-start gap-2.5 px-3 py-2.5 rounded-lg bg-brand-50 border border-brand-100">
              <Info className="w-4 h-4 text-brand-600 shrink-0 mt-0.5" />
              <p className="text-xs text-brand-800 leading-relaxed">
                Bu davet bağlantısı <strong>14 gün</strong> boyunca geçerli
                olacak. Müşteri kayıt formunu doldurup e-postasını
                doğruladığında başvuru <strong>incelemeye</strong> düşer —
                ardından admin panelden manuel onay vereceksiniz.
              </p>
            </div>

            <footer className="flex items-center gap-2 pt-2">
              <Button
                type="button"
                variant="ghost"
                onClick={onClose}
                className="flex-1"
              >
                İptal
              </Button>
              <Button
                type="submit"
                loading={send.isPending}
                disabled={send.isPending}
                className="flex-1"
              >
                {isResend ? "Yeniden Gönder" : "Daveti Gönder"}
              </Button>
            </footer>
          </form>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
