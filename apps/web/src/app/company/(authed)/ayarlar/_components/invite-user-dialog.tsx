"use client";

import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Input } from "@/components/catalyst/input";
import { useInviteUser } from "@/hooks/use-company-users";
import type { CompanyRole } from "@/lib/company-auth/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { useState } from "react";
import { toast } from "sonner";

const ROLES: { key: CompanyRole; label: string }[] = [
  { key: "YONETICI", label: "Yönetici" },
  { key: "SATIN_ALMACI", label: "Satın Almacı" },
  { key: "SATISCI", label: "Satışçı" },
  { key: "ONAYLAYICI", label: "Onaylayıcı" },
];

export function InviteUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteUser();
  const [email, setEmail] = useState("");
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [password, setPassword] = useState("");
  const [byEmail, setByEmail] = useState(true);
  const [roles, setRoles] = useState<CompanyRole[]>(["SATIN_ALMACI"]);

  const toggle = (r: CompanyRole) =>
    setRoles((cur) =>
      cur.includes(r) ? cur.filter((x) => x !== r) : [...cur, r],
    );

  const canSave =
    email.includes("@") &&
    firstName.trim().length >= 2 &&
    lastName.trim().length >= 2 &&
    (byEmail || password.length >= 8) &&
    roles.length > 0;

  const reset = () => {
    setEmail("");
    setFirstName("");
    setLastName("");
    setPassword("");
    setByEmail(true);
    setRoles(["SATIN_ALMACI"]);
  };

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await invite.mutateAsync({
        email: email.trim(),
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        password: byEmail ? undefined : password,
        roles,
      });
      toast.success(
        byEmail ? "Davet e-postası gönderildi" : "Kullanıcı eklendi",
      );
      reset();
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Eklenemedi"));
    }
  };

  return (
    <Dialog open={open} onClose={() => !invite.isPending && onClose()} size="md">
      <DialogTitle>Kullanıcı Ekle</DialogTitle>
      <DialogDescription>
        Ekip üyesi ekleyin ve rollerini atayın.
      </DialogDescription>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Field>
            <Label>Ad</Label>
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} />
          </Field>
          <Field>
            <Label>Soyad</Label>
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} />
          </Field>
        </div>
        <Field>
          <Label>E-posta</Label>
          <Input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>
        <div>
          <Label>Parola yöntemi</Label>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setByEmail(true)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                byEmail
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              <div className="font-semibold">E-posta daveti</div>
              <div className="mt-0.5 text-[11px] opacity-80">
                Kullanıcı parolasını kendi belirler
              </div>
            </button>
            <button
              type="button"
              onClick={() => setByEmail(false)}
              className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                !byEmail
                  ? "border-blue-500 bg-blue-50 text-blue-800"
                  : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
              }`}
            >
              <div className="font-semibold">Parolayı ben belirle</div>
              <div className="mt-0.5 text-[11px] opacity-80">
                Geçici parola gir, paylaş
              </div>
            </button>
          </div>
        </div>
        {!byEmail ? (
          <Field>
            <Label>Geçici parola (en az 8)</Label>
            <Input
              type="text"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Harf + rakam içermeli"
            />
          </Field>
        ) : null}
        <div>
          <Label>Roller</Label>
          <div className="mt-2 flex flex-wrap gap-2">
            {ROLES.map((r) => {
              const on = roles.includes(r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggle(r.key)}
                  className={`rounded-md border px-2.5 py-1 text-xs transition ${
                    on
                      ? "border-blue-500 bg-blue-50 text-blue-700"
                      : "border-zinc-200 text-zinc-500 hover:border-zinc-300"
                  }`}
                >
                  {r.label}
                </button>
              );
            })}
          </div>
        </div>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose} disabled={invite.isPending}>
          Vazgeç
        </Button>
        <Button onClick={handleSave} disabled={!canSave || invite.isPending}>
          {invite.isPending ? "Ekleniyor…" : "Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
