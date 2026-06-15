"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useInviteTeamMember } from "@/hooks/use-supplier-team";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import * as Dialog from "@radix-ui/react-dialog";
import { Mail, UserPlus2, X } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  open: boolean;
  onClose: () => void;
}

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function InviteMemberModal({ open, onClose }: Props) {
  const [email, setEmail] = useState("");
  const mutation = useInviteTeamMember();

  const handleClose = () => {
    if (mutation.isPending) return;
    setEmail("");
    onClose();
  };

  const canSubmit = EMAIL_RE.test(email.trim());

  const handleSubmit = async () => {
    if (!canSubmit) return;
    try {
      await mutation.mutateAsync(email.trim().toLowerCase());
      toast.success("Davet gönderildi");
      setEmail("");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  return (
    <Dialog.Root open={open} onOpenChange={(o) => !o && handleClose()}>
      <Dialog.Portal>
        <Dialog.Overlay className="fixed inset-0 bg-slate-900/60 z-[60]" />
        <Dialog.Content
          className={cn(
            "fixed left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 z-[60]",
            "w-[calc(100vw-2rem)] max-w-md bg-white rounded-2xl shadow-2xl outline-none",
          )}
        >
          <header className="px-5 py-4 border-b border-surface-border flex items-start justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="w-10 h-10 rounded-full bg-brand-50 flex items-center justify-center shrink-0">
                <UserPlus2 className="w-5 h-5 text-brand-600" />
              </div>
              <Dialog.Title className="font-display font-bold text-lg text-brand-900">
                Ekip Üyesi Davet Et
              </Dialog.Title>
            </div>
            <button
              type="button"
              onClick={handleClose}
              disabled={mutation.isPending}
              aria-label="Kapat"
              className="text-slate-400 hover:text-slate-600 disabled:opacity-40"
            >
              <X className="w-5 h-5" />
            </button>
          </header>

          <div className="px-5 py-5 space-y-4">
            <p className="text-sm text-slate-500">
              Davet edilen kişi e-postasındaki bağlantıyla şifresini belirleyip
              ekibinize <strong>tam yetkili</strong> üye olarak katılır.
            </p>
            <Field>
              <Label htmlFor="invite-email" required>
                E-posta Adresi
              </Label>
              <div className="relative">
                <Mail className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  id="invite-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="ad@firma.com"
                  className="pl-9"
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && canSubmit) handleSubmit();
                  }}
                />
              </div>
            </Field>
          </div>

          <footer className="px-5 py-4 border-t border-surface-border flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleClose}
              disabled={mutation.isPending}
            >
              Vazgeç
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSubmit}
              disabled={!canSubmit || mutation.isPending}
              loading={mutation.isPending}
            >
              Davet Gönder
            </Button>
          </footer>
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
