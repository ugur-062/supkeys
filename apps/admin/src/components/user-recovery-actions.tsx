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
import {
  AtSign,
  MailCheck,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  ShieldOff,
} from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

interface ProfileFields {
  firstName: string;
  lastName: string;
  phone: string;
}

interface Props {
  email: string;
  emailVerified: boolean;
  twoFaEnabled: boolean;
  pending: boolean;
  onVerifyEmail: () => void;
  onReset2fa: () => void;
  onChangeEmail: (email: string) => Promise<unknown> | void;
  // Profil düzenleme (opsiyonel).
  profile?: ProfileFields;
  onSaveProfile?: (fields: ProfileFields) => Promise<unknown> | void;
  // Tedarikçi yönetici terfi/indirme (opsiyonel).
  isManager?: boolean;
  onToggleManager?: () => void;
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
  profile,
  onSaveProfile,
  isManager,
  onToggleManager,
}: Props) {
  const [emailModalOpen, setEmailModalOpen] = useState(false);
  const [newEmail, setNewEmail] = useState(email);
  const [saving, setSaving] = useState(false);
  const [profileOpen, setProfileOpen] = useState(false);
  const [pForm, setPForm] = useState<ProfileFields>(
    profile ?? { firstName: "", lastName: "", phone: "" },
  );

  const submitProfile = async () => {
    if (!onSaveProfile) return;
    setSaving(true);
    try {
      await onSaveProfile({
        firstName: pForm.firstName.trim(),
        lastName: pForm.lastName.trim(),
        phone: pForm.phone.trim(),
      });
      toast.success("Profil güncellendi");
      setProfileOpen(false);
    } catch (e: unknown) {
      toast.error(e instanceof Error ? e.message : "Güncellenemedi");
    } finally {
      setSaving(false);
    }
  };

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
          {profile && onSaveProfile ? (
            <DropdownItem
              onClick={() => {
                setPForm(profile);
                setProfileOpen(true);
              }}
            >
              <Pencil data-slot="icon" />
              <DropdownLabel>Profili düzenle</DropdownLabel>
            </DropdownItem>
          ) : null}
          {onToggleManager ? (
            <DropdownItem onClick={onToggleManager}>
              {isManager ? (
                <ShieldOff data-slot="icon" />
              ) : (
                <ShieldCheck data-slot="icon" />
              )}
              <DropdownLabel>
                {isManager ? "Yöneticilikten çıkar" : "Yönetici yap"}
              </DropdownLabel>
            </DropdownItem>
          ) : null}
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

      <Dialog open={profileOpen} onClose={() => setProfileOpen(false)}>
        <DialogTitle>Profili düzenle</DialogTitle>
        <DialogDescription>Ad, soyad ve telefonu güncelle.</DialogDescription>
        <DialogBody className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <Input
              value={pForm.firstName}
              onChange={(e) =>
                setPForm((p) => ({ ...p, firstName: e.target.value }))
              }
              placeholder="Ad"
            />
            <Input
              value={pForm.lastName}
              onChange={(e) =>
                setPForm((p) => ({ ...p, lastName: e.target.value }))
              }
              placeholder="Soyad"
            />
          </div>
          <Input
            value={pForm.phone}
            onChange={(e) =>
              setPForm((p) => ({ ...p, phone: e.target.value }))
            }
            placeholder="Telefon"
          />
        </DialogBody>
        <DialogActions>
          <Button
            type="button"
            variant="ghost"
            onClick={() => setProfileOpen(false)}
            disabled={saving}
          >
            Vazgeç
          </Button>
          <Button type="button" onClick={submitProfile} disabled={saving}>
            {saving ? "Kaydediliyor..." : "Kaydet"}
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
