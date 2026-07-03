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

const ROLES: { key: CompanyRole; label: string; hint: string }[] = [
  { key: "YONETICI", label: "Yönetici", hint: "Hesap ve ekip yönetimi" },
  { key: "SATIN_ALMACI", label: "Satın Almacı", hint: "Alım ihaleleri" },
  { key: "SATISCI", label: "Satışçı", hint: "Satış ilanları" },
  { key: "ONAYLAYICI", label: "Onaylayıcı", hint: "Onay süreçleri" },
];

/**
 * Token'lı davet — yalnızca e-posta + rol girilir. Davetli, e-postadaki linkten
 * adını/parolasını KENDİSİ belirleyip sözleşmeleri onaylayarak katılır.
 */
export function InviteUserDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const invite = useInviteUser();
  const [email, setEmail] = useState("");
  const [roles, setRoles] = useState<CompanyRole[]>(["SATIN_ALMACI"]);

  // Kural: tek rol; istisna Satın Almacı + Satışçı birlikte.
  const toggle = (r: CompanyRole) =>
    setRoles((cur) => {
      if (cur.includes(r)) return cur.filter((x) => x !== r);
      if (r === "YONETICI" || r === "ONAYLAYICI") return [r];
      const ops = cur.filter((x) => x === "SATIN_ALMACI" || x === "SATISCI");
      return [...ops, r];
    });

  const canSave = email.includes("@") && roles.length > 0;

  const handleSave = async () => {
    if (!canSave) return;
    try {
      await invite.mutateAsync({ email: email.trim(), roles });
      toast.success("Davet e-postası gönderildi — 7 gün geçerli");
      setEmail("");
      setRoles(["SATIN_ALMACI"]);
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Davet gönderilemedi"));
    }
  };

  return (
    <Dialog open={open} onClose={() => !invite.isPending && onClose()} size="md">
      <DialogTitle>Üye Davet Et</DialogTitle>
      <DialogDescription>
        Davetli, e-postasındaki linkten adını ve parolasını kendisi belirleyerek
        ekibe katılır. Davet 7 gün geçerlidir.
      </DialogDescription>
      <DialogBody className="space-y-4">
        <Field>
          <Label>E-posta</Label>
          <Input
            type="email"
            autoFocus
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="kisi@firma.com"
          />
        </Field>
        <div>
          <p className="text-sm font-medium text-zinc-900">Rol</p>
          <p className="mt-0.5 text-xs text-zinc-500">
            Yönetici ve Onaylayıcı tek başına atanır; yalnızca Satın Almacı +
            Satışçı birlikte seçilebilir.
          </p>
          <div className="mt-2 grid grid-cols-2 gap-2">
            {ROLES.map((r) => {
              const on = roles.includes(r.key);
              return (
                <button
                  key={r.key}
                  type="button"
                  onClick={() => toggle(r.key)}
                  className={`rounded-lg border px-3 py-2 text-left text-xs transition ${
                    on
                      ? "border-zinc-900 bg-zinc-900 text-white"
                      : "border-zinc-200 text-zinc-600 hover:border-zinc-400"
                  }`}
                >
                  <div className="font-semibold">{r.label}</div>
                  <div className="mt-0.5 text-[11px] opacity-70">{r.hint}</div>
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
          {invite.isPending ? "Gönderiliyor…" : "Davet Gönder"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
