"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import { Checkbox, CheckboxField } from "@/components/catalyst/checkbox";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { Text } from "@/components/catalyst/text";
import { IconButton } from "@/components/ui/icon-button";
import { useSupplierAuth } from "@/hooks/use-supplier-auth";
import {
  type SupplierBank,
  useCreateSupplierBank,
  useDeleteSupplierBank,
  useSupplierBanks,
  useUpdateSupplierBank,
} from "@/hooks/use-supplier-banks";
import { Lock, Pencil, Plus, Star, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function maskIban(iban: string): string {
  const v = iban.replace(/\s+/g, "");
  if (v.length <= 8) return v;
  return `${v.slice(0, 6)} •••• ${v.slice(-4)}`;
}

type FormState = {
  accountHolder: string;
  iban: string;
  bankName: string;
  label: string;
  isDefault: boolean;
};

const EMPTY: FormState = {
  accountHolder: "",
  iban: "",
  bankName: "",
  label: "",
  isDefault: false,
};

export function BanksCard() {
  const { supplierUser } = useSupplierAuth();
  const isManager = supplierUser?.isManager === true;
  const { data: banks, isLoading } = useSupplierBanks();
  const createM = useCreateSupplierBank();
  const updateM = useUpdateSupplierBank();
  const deleteM = useDeleteSupplierBank();

  // null = form kapalı; "new" = ekleme; bank.id = düzenleme
  const [editing, setEditing] = useState<string | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY);

  const openNew = () => {
    setForm(EMPTY);
    setEditing("new");
  };
  const openEdit = (b: SupplierBank) => {
    setForm({
      accountHolder: b.accountHolder,
      iban: b.iban,
      bankName: b.bankName ?? "",
      label: b.label ?? "",
      isDefault: b.isDefault,
    });
    setEditing(b.id);
  };
  const close = () => setEditing(null);

  const save = async () => {
    if (form.accountHolder.trim().length < 2 || form.iban.trim().length < 15) {
      toast.error("Hesap sahibi ve geçerli bir IBAN girin");
      return;
    }
    const payload = {
      accountHolder: form.accountHolder.trim(),
      iban: form.iban.trim(),
      bankName: form.bankName.trim() || undefined,
      label: form.label.trim() || undefined,
      isDefault: form.isDefault,
    };
    try {
      if (editing === "new") {
        await createM.mutateAsync(payload);
        toast.success("Banka hesabı eklendi");
      } else if (editing) {
        await updateM.mutateAsync({ id: editing, ...payload });
        toast.success("Banka hesabı güncellendi");
      }
      close();
    } catch {
      toast.error("Kaydedilemedi");
    }
  };

  const remove = async (b: SupplierBank) => {
    if (!confirm(`"${b.label || b.bankName || maskIban(b.iban)}" silinsin mi?`))
      return;
    try {
      await deleteM.mutateAsync(b.id);
      toast.success("Banka hesabı silindi");
    } catch {
      toast.error("Silinemedi");
    }
  };

  return (
    <section className="space-y-4">
      <header className="flex items-start justify-between gap-3">
        <div>
          <Subheading>Kayıtlı Bankalarım</Subheading>
          <Text className="mt-1">
            Sipariş onaylarken bu hesaplardan seçilir.
          </Text>
        </div>
        {isManager ? (
          <Button outline onClick={openNew}>
            <Plus data-slot="icon" /> Ekle
          </Button>
        ) : (
          <Badge>
            <Lock className="h-3 w-3" /> Yalnızca yönetici
          </Badge>
        )}
      </header>

      {isLoading ? (
        <p className="text-sm text-slate-500 py-4">Yükleniyor…</p>
      ) : (banks?.length ?? 0) === 0 ? (
        <p className="text-sm text-slate-500 py-4 text-center">
          Henüz kayıtlı banka hesabı yok.
          {isManager ? " “Ekle” ile ilk hesabı tanımlayın." : ""}
        </p>
      ) : (
        <ul className="divide-y divide-surface-border">
          {banks!.map((b) => (
            <li
              key={b.id}
              className="py-3 flex items-center justify-between gap-3"
            >
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="font-medium text-zinc-950 text-sm truncate">
                    {b.label || b.bankName || "Banka hesabı"}
                  </span>
                  {b.isDefault ? (
                    <Badge color="amber">
                      <Star className="h-3 w-3 fill-current" /> Varsayılan
                    </Badge>
                  ) : null}
                </div>
                <p className="text-xs text-slate-500 truncate">
                  {b.accountHolder} · {maskIban(b.iban)}
                  {b.bankName && b.label ? ` · ${b.bankName}` : ""}
                </p>
              </div>
              {isManager ? (
                <div className="flex items-center gap-1 shrink-0">
                  <IconButton onClick={() => openEdit(b)} aria-label="Düzenle">
                    <Pencil className="h-4 w-4" />
                  </IconButton>
                  <IconButton
                    tone="danger"
                    onClick={() => remove(b)}
                    aria-label="Sil"
                  >
                    <Trash2 className="h-4 w-4" />
                  </IconButton>
                </div>
              ) : null}
            </li>
          ))}
        </ul>
      )}

      {/* Ekle/Düzenle formu (yalnız yönetici) */}
      {isManager && editing ? (
        <div className="rounded-xl border border-surface-border bg-surface-subtle/40 p-4 space-y-3">
          <h3 className="text-sm font-semibold text-zinc-950">
            {editing === "new" ? "Yeni Banka Hesabı" : "Hesabı Düzenle"}
          </h3>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <Field>
              <Label>Hesap Sahibi *</Label>
              <Input
                value={form.accountHolder}
                onChange={(e) =>
                  setForm((f) => ({ ...f, accountHolder: e.target.value }))
                }
                placeholder="Firma Ünvanı"
              />
            </Field>
            <Field>
              <Label>IBAN *</Label>
              <Input
                value={form.iban}
                onChange={(e) =>
                  setForm((f) => ({ ...f, iban: e.target.value }))
                }
                placeholder="TR.. .... ...."
              />
            </Field>
            <Field>
              <Label>Banka Adı</Label>
              <Input
                value={form.bankName}
                onChange={(e) =>
                  setForm((f) => ({ ...f, bankName: e.target.value }))
                }
                placeholder="örn. Vakıfbank"
              />
            </Field>
            <Field>
              <Label>Etiket</Label>
              <Input
                value={form.label}
                onChange={(e) =>
                  setForm((f) => ({ ...f, label: e.target.value }))
                }
                placeholder="örn. Ana hesap"
              />
            </Field>
          </div>
          <CheckboxField>
            <Checkbox
              checked={form.isDefault}
              onChange={(checked) =>
                setForm((f) => ({ ...f, isDefault: checked }))
              }
            />
            <Label>Varsayılan hesap yap</Label>
          </CheckboxField>
          <div className="flex items-center justify-end gap-2 pt-1">
            <Button plain onClick={close}>
              Vazgeç
            </Button>
            <Button
              onClick={save}
              disabled={createM.isPending || updateM.isPending}
            >
              Kaydet
            </Button>
          </div>
        </div>
      ) : null}
    </section>
  );
}
