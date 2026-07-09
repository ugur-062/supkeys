"use client";

import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  useAddresses,
  useDeleteAddress,
  useSaveAddress,
  type CompanyAddress,
  type CompanyAddressType,
} from "@/hooks/use-company-addresses";
import { extractErrorMessage } from "@/lib/tenders/error";
import { COUNTRIES } from "@rothern/shared";
import { Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

function typeLabel(t: CompanyAddressType) {
  return t === "FATURA" ? "Fatura" : t === "ILETISIM" ? "İletişim" : "Teslimat";
}

export function AddressBookSection({ canManage }: { canManage: boolean }) {
  const { data: addresses, isLoading } = useAddresses();
  const del = useDeleteAddress();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<CompanyAddress | "new" | null>(null);

  const handleDelete = async (a: CompanyAddress) => {
    const ok = await confirm({
      title: "Adres silinsin mi?",
      description: `"${a.title}" adresi kalıcı olarak silinecek.`,
      confirmLabel: "Sil",
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(a.id);
      toast.success("Adres silindi");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Silinemedi"));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>Firma Tercihleri — Adres Defteri</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            Fatura ve teslimat adreslerini kaydedin; ihalelerde kullanın.
          </Text>
        </div>
        {canManage ? (
          <Button onClick={() => setEditing("new")}>Adres Ekle</Button>
        ) : null}
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">Yükleniyor…</Text>
      ) : !addresses || addresses.length === 0 ? (
        <Text className="mt-3 text-sm text-zinc-500">
          Henüz kayıtlı adres yok.
        </Text>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {addresses.map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-zinc-200 p-4"
            >
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-zinc-900">
                      {a.title}
                    </span>
                    <Badge
                      color={
                        a.type === "FATURA"
                          ? "blue"
                          : a.type === "ILETISIM"
                            ? "purple"
                            : "emerald"
                      }
                    >
                      {typeLabel(a.type)}
                    </Badge>
                    {a.isDefault ? <Badge color="amber">Varsayılan</Badge> : null}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {a.addressLine}
                    {a.district ? `, ${a.district}` : ""}
                    {a.city ? `, ${a.city}` : ""}
                  </div>
                  {a.type === "FATURA" && (a.taxOffice || a.taxNumber) ? (
                    <div className="mt-0.5 text-xs text-zinc-400">
                      VD: {a.taxOffice ?? "—"} · VKN: {a.taxNumber ?? "—"}
                    </div>
                  ) : null}
                </div>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button plain onClick={() => setEditing(a)}>
                      Düzenle
                    </Button>
                    <Button plain onClick={() => handleDelete(a)}>
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : null}
              </div>
            </div>
          ))}
        </div>
      )}

      {editing ? (
        <AddressDialog
          address={editing === "new" ? null : editing}
          onClose={() => setEditing(null)}
        />
      ) : null}
    </section>
  );
}

function AddressDialog({
  address,
  onClose,
}: {
  address: CompanyAddress | null;
  onClose: () => void;
}) {
  const save = useSaveAddress();
  const [f, setF] = useState({
    type: address?.type ?? ("TESLIMAT" as CompanyAddressType),
    title: address?.title ?? "",
    contactName: address?.contactName ?? "",
    phone: address?.phone ?? "",
    country: address?.country ?? "TR",
    city: address?.city ?? "",
    district: address?.district ?? "",
    addressLine: address?.addressLine ?? "",
    postalCode: address?.postalCode ?? "",
    taxOffice: address?.taxOffice ?? "",
    taxNumber: address?.taxNumber ?? "",
    isDefault: address?.isDefault ?? false,
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));

  const submit = async () => {
    if (!f.title.trim() || !f.addressLine.trim()) {
      toast.error("Başlık ve açık adres zorunlu");
      return;
    }
    const phone = f.phone.trim();
    if (phone && !/^\+?[0-9 ()-]{7,20}$/.test(phone)) {
      toast.error("Geçerli bir telefon numarası giriniz");
      return;
    }
    if (f.type === "FATURA") {
      if (!f.taxOffice.trim() || !f.taxNumber.trim()) {
        toast.error("Fatura adresi için vergi dairesi ve vergi no zorunlu");
        return;
      }
      // TR: VKN 10 hane / TCKN 11 hane; yabancı adreslerde format serbest.
      const tax = f.taxNumber.trim();
      if (f.country === "TR" && !/^\d{10}(\d)?$/.test(tax)) {
        toast.error("Vergi no 10 haneli VKN ya da 11 haneli TCKN olmalı");
        return;
      }
    }
    try {
      await save.mutateAsync({ id: address?.id, ...f });
      toast.success(address ? "Adres güncellendi" : "Adres eklendi");
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, "Kaydedilemedi"));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>{address ? "Adresi Düzenle" : "Yeni Adres"}</DialogTitle>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>Adres tipi</Label>
            <Select
              value={f.type}
              onChange={(e) =>
                set({ type: e.target.value as CompanyAddressType })
              }
            >
              <option value="TESLIMAT">Teslimat</option>
              <option value="FATURA">Fatura</option>
              <option value="ILETISIM">İletişim</option>
            </Select>
          </Field>
          <Field>
            <Label>Başlık</Label>
            <Input
              value={f.title}
              onChange={(e) => set({ title: e.target.value })}
              placeholder="Merkez, Depo…"
            />
          </Field>
          <Field>
            <Label>İlgili kişi</Label>
            <Input
              value={f.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
            />
          </Field>
          <Field>
            <Label>Telefon</Label>
            <PhoneInput value={f.phone} onChange={(v) => set({ phone: v })} />
          </Field>
          <Field>
            <Label>Ülke</Label>
            <Select
              value={f.country}
              onChange={(e) => set({ country: e.target.value })}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {c.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>İl</Label>
            <Input
              value={f.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          </Field>
          <Field>
            <Label>İlçe</Label>
            <Input
              value={f.district}
              onChange={(e) => set({ district: e.target.value })}
            />
          </Field>
        </div>
        <Field>
          <Label>Açık adres</Label>
          <Input
            value={f.addressLine}
            onChange={(e) => set({ addressLine: e.target.value })}
          />
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label>Posta kodu</Label>
            <Input
              value={f.postalCode}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
          </Field>
          {f.type === "FATURA" ? (
            <>
              <Field>
                <Label>Vergi dairesi</Label>
                <Input
                  value={f.taxOffice}
                  onChange={(e) => set({ taxOffice: e.target.value })}
                />
              </Field>
              <Field>
                <Label>Vergi no</Label>
                <Input
                  value={f.taxNumber}
                  onChange={(e) => set({ taxNumber: e.target.value })}
                />
              </Field>
            </>
          ) : null}
        </div>
        <label className="flex items-center gap-2 text-sm text-zinc-700">
          <input
            type="checkbox"
            checked={f.isDefault}
            onChange={(e) => set({ isDefault: e.target.checked })}
            className="h-4 w-4 rounded border-zinc-300"
          />
          Bu tip için varsayılan adres
        </label>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          Vazgeç
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {address ? "Kaydet" : "Ekle"}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
