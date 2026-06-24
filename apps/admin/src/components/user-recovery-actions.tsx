"use client";

import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import {
  Dropdown,
  DropdownButton,
  DropdownItem,
  DropdownLabel,
  DropdownMenu,
} from "@/components/catalyst/dropdown";
import { Input } from "@/components/catalyst/input";
import { Button } from "@/components/ui/button";
import { MailCheck, MoreHorizontal, ShieldOff, AtSign } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface Props {
  email: string;
  emailVerified: boolean;
  twoFaEnabled: boolean;
  pending: boolean;
  onVerifyEmail: () => void;
  onReset2fa: () => void;
  onChangeEmail: (email: string) => Promise<unknown> | void;
}

/**
 * Admin hesap kurtarma menüsü — alıcı + tedarikçi kullanıcı satırlarında ortak.
 * E-postayı zorla doğrula, 2FA sıfırla, e-posta değiştir.
 */
export function UserRecoveryActions({
  email,
  emailVerified,
  twoFaEnabled,
  pending,
  onVerifyEmail,
  onReset2fa,
  onChangeEmail,
}: Props) {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [saving, setSaving] = useState(false);

  const submitEmail = async () => {
    const value = newEmail.trim().toLowerCase();
    if (!value || value === email.toLowerCase()) {
      setEmailModalOpen(false);
      return;
    }
    setSaving(true);
    try {
      await onChangeEmail(value);
      toast.success("E-posta güncellendi");
      setEmailModalOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "E-posta değiştirilemedi");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <Dropdown>
        <DropdownButton plain aria-label="Kurtarma işlemleri" disabled={pending}>
          <MoreHorizontal className="h-4 w-4" />
        </DropdownButton>
        <DropdownMenu anchor="bottom end">
          {!emailVerified ? (
            <DropdownItem onClick={onVerifyEmail}>
              <MailCheck data-slot="icon" />
              <DropdownLabel>E-postayı doğrula</DropdownLabel>
            </DropdownItem>
          ) : null}
          {twoFaEnabled ? (
            <DropdownItem onClick={onReset2fa}>
              <ShieldOff data-slot="icon" />
              <DropdownLabel>2FA sıfırla</DropdownLabel>
            </DropdownItem>
          ) : null}
          <DropdownItem
            onClick={() => {
              setNewEmail(email);
              setEmailModalOpen(true);
            }}
          >
            <AtSign data-slot="icon" />
            <DropdownLabel>E-posta değiştir</DropdownLabel>
          </DropdownItem>
        </DropdownMenu>
      </Dropdown>

      <Dialog open={emailModalOpen} onClose={() => setEmailModalOpen(false)}>
        <DialogTitle>E-posta değiştir</DialogTitle>
        <DialogDescription>
          Yeni adres doğrulanmış sayılır. Kullanıcı bu adresle giriş yapar.
        </DialogDescription>
        <DialogBody>
          <Input
            type="email"
            value={newEmail}
            onChange={(e) => setNewEmail(e.target.value)}
            placeholder="yeni@firma.com"
          />
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setEmailModalOpen(false)}
            disabled={saving}
          >
            Vazgeç
          </Button>
          <Button type="button" onClick={submitEmail} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Değiştir"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
