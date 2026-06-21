"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Input, InputGroup } from "@/components/catalyst/input";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Label } from "@/components/ui/label";
import { useInviteTeamMember } from "@/hooks/use-supplier-team";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Mail } from "lucide-react";
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
    <Dialog open={open} onClose={handleClose} size="md">
      <DialogTitle>Ekip Üyesi Davet Et</DialogTitle>
      <DialogBody className="space-y-4">
        <p className="text-sm text-zinc-500">
          Davet edilen kişi e-postasındaki bağlantıyla şifresini belirleyip
          ekibinize <strong>tam yetkili</strong> üye olarak katılır.
        </p>
        <Field>
          <Label htmlFor="invite-email" required>
            E-posta Adresi
          </Label>
          <InputGroup>
            <Mail data-slot="icon" />
            <Input
              id="invite-email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="ad@firma.com"
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSubmit) handleSubmit();
              }}
            />
          </InputGroup>
        </Field>
      </DialogBody>
      <DialogActions>
        <Button
          variant="ghost"
          onClick={handleClose}
          disabled={mutation.isPending}
        >
          Vazgeç
        </Button>
        <Button
          variant="primary"
          onClick={handleSubmit}
          disabled={!canSubmit || mutation.isPending}
          loading={mutation.isPending}
        >
          Davet Gönder
        </Button>
      </DialogActions>
    </Dialog>
  );
}
