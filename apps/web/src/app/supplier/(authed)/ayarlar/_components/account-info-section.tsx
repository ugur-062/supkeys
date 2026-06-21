"use client";

import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  useUpdateSupplierAccount,
  type UpdateAccountPayload,
} from "@/hooks/use-supplier-account";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Mail, Pencil, UserRound } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

export function AccountInfoSection() {
  const { supplierUser } = useSupplierAuth();
  const updateMutation = useUpdateSupplierAccount();
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState({
    firstName: "",
    lastName: "",
    phone: "",
  });

  if (!supplierUser) return null;

  const startEdit = () => {
    setDraft({
      firstName: supplierUser.firstName,
      lastName: supplierUser.lastName,
      phone: supplierUser.phone ?? "",
    });
    setEditing(true);
  };

  const canSave =
    draft.firstName.trim().length >= 2 && draft.lastName.trim().length >= 2;

  const handleSave = async () => {
    if (!canSave) return;
    const payload: UpdateAccountPayload = {
      firstName: draft.firstName.trim(),
      lastName: draft.lastName.trim(),
      phone: draft.phone.trim(),
    };
    try {
      await updateMutation.mutateAsync(payload);
      toast.success("Hesap bilgileri güncellendi");
      setEditing(false);
    } catch (err) {
      toast.error(extractErrorMessage(err, "Güncellenemedi"));
    }
  };

  return (
    <section className="card p-6 space-y-5">
      <div className="flex items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-50">
            <UserRound className="h-5 w-5 text-zinc-600" />
          </div>
          <div>
            <h2 className="font-semibold text-lg text-zinc-900">
              Hesap Bilgileri
            </h2>
            <p className="text-sm text-slate-500 mt-0.5">
              Ad, soyad ve telefon bilginizi güncelleyin.
            </p>
          </div>
        </div>
        {!editing ? (
          <Button variant="secondary" size="sm" onClick={startEdit}>
            <Pencil className="h-4 w-4" />
            Düzenle
          </Button>
        ) : null}
      </div>

      {!editing ? (
        <DescriptionList>
          <DescriptionTerm>Ad Soyad</DescriptionTerm>
          <DescriptionDetails>
            {supplierUser.firstName} {supplierUser.lastName}
          </DescriptionDetails>
          <DescriptionTerm>Telefon</DescriptionTerm>
          <DescriptionDetails>{supplierUser.phone || "—"}</DescriptionDetails>
          <DescriptionTerm>E-posta</DescriptionTerm>
          <DescriptionDetails>
            <span className="flex items-center gap-1.5">
              <Mail className="h-3.5 w-3.5 text-zinc-400" />
              {supplierUser.email}
              <span className="text-xs text-zinc-400">(değiştirilemez)</span>
            </span>
          </DescriptionDetails>
        </DescriptionList>
      ) : (
        <div className="space-y-5">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <Field>
              <Label htmlFor="ac-first" required>
                Ad
              </Label>
              <Input
                id="ac-first"
                value={draft.firstName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, firstName: e.target.value }))
                }
                maxLength={50}
              />
            </Field>
            <Field>
              <Label htmlFor="ac-last" required>
                Soyad
              </Label>
              <Input
                id="ac-last"
                value={draft.lastName}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, lastName: e.target.value }))
                }
                maxLength={50}
              />
            </Field>
            <Field>
              <Label htmlFor="ac-phone">Telefon</Label>
              <Input
                id="ac-phone"
                value={draft.phone}
                onChange={(e) =>
                  setDraft((d) => ({ ...d, phone: e.target.value }))
                }
                maxLength={30}
                placeholder="Ör. 0212 000 00 00"
              />
            </Field>
          </div>

          <div className="flex items-center justify-end gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setEditing(false)}
              disabled={updateMutation.isPending}
            >
              İptal
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={!canSave || updateMutation.isPending}
              loading={updateMutation.isPending}
            >
              Kaydet
            </Button>
          </div>
        </div>
      )}
    </section>
  );
}
