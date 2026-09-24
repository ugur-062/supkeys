"use client";

import { useLocale, useTranslations } from "next-intl";
import type { Locale } from "@rothern/i18n";
import { countryDisplayName } from "@/i18n/domain";
import { Badge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { ErrorMessage, Field, Label } from "@/components/catalyst/fieldset";
import { Subheading } from "@/components/catalyst/heading";
import { Input } from "@/components/catalyst/input";
import { PhoneInput } from "@/components/ui/phone-input";
import { Select } from "@/components/catalyst/select";
import { Text } from "@/components/catalyst/text";
import { Textarea } from "@/components/catalyst/textarea";
import { isValidPhone } from "@/lib/company/phone";
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
import { Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import { toast } from "sonner";

const TYPE_ORDER: CompanyAddressType[] = ["FATURA", "TESLIMAT", "ILETISIM"];

export function AddressBookSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("web.panel.settings.addressBookSection");
  const typeLabel = (type: CompanyAddressType) =>
    type === "FATURA" ? t("fatura") : type === "ILETISIM" ? t("iletisim") : t("teslimat");
  const { data: addresses, isLoading, isError, refetch } = useAddresses();
  const del = useDeleteAddress();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<CompanyAddress | "new" | null>(null);

  const handleDelete = async (a: CompanyAddress) => {
    const ok = await confirm({
      title: t("adresSilinsinMi"),
      description: t("adresiKaliciOlarakSilinecek", { title: a.title }),
      confirmLabel: t("sil"),
      destructive: true,
    });
    if (!ok) return;
    try {
      await del.mutateAsync(a.id);
      toast.success(t("adresSilindi"));
    } catch (err) {
      toast.error(extractErrorMessage(err, t("silinemedi")));
    }
  };

  return (
    <section className="rounded-xl border border-zinc-950/10 bg-white p-5">
      <div className="flex items-center justify-between">
        <div>
          <Subheading>{t("kayitliAdresler")}</Subheading>
          <Text className="mt-0.5 text-sm text-zinc-500">
            {t("faturaVeTeslimatAdresleriniKaydedin")}
          </Text>
        </div>
        {canManage ? (
          <Button onClick={() => setEditing("new")}>{t("adresEkle")}</Button>
        ) : null}
      </div>

      {isLoading ? (
        <Text className="mt-3 text-sm text-zinc-500">{t("yukleniyor")}</Text>
      ) : isError ? (
        <p role="alert" className="mt-3 text-sm text-rose-800">
          {t("adreslerYuklenemedi")}{" "}
          <button type="button" onClick={() => void refetch()} className="font-semibold underline underline-offset-2">
            {t("yenidenDene")}
          </button>
        </p>
      ) : !addresses || addresses.length === 0 ? (
        <Text className="mt-3 text-sm text-zinc-500">
          {t("henuzKayitliAdresYokFatura")}
        </Text>
      ) : (
        <div className="mt-4 grid gap-3 sm:grid-cols-2">
          {/* Sıra: tip (Fatura → Teslimat → İletişim), tip içinde varsayılan önce. */}
          {[...addresses]
            .sort(
              (a, b) =>
                TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
                Number(b.isDefault) - Number(a.isDefault),
            )
            .map((a) => (
            <div
              key={a.id}
              className="rounded-lg border border-zinc-200 p-4"
            >
              {/* C35: başlık kendi satırında (uzun ad rozet/aksiyonla
                  yarışıp 3 satıra kırılıyordu); rozetler ikinci satırda.
                  C36: satır aksiyonları ikon standardı (kalem + çöp). */}
              <div className="flex items-start justify-between gap-2">
                <span
                  className="min-w-0 truncate text-sm font-semibold text-zinc-900"
                  title={a.title}
                >
                  {a.title}
                </span>
                {canManage ? (
                  <div className="flex shrink-0 items-center gap-1">
                    <Button
                      plain
                      aria-label={t("duzenle")}
                      title={t("duzenle")}
                      onClick={() => setEditing(a)}
                    >
                      <Pencil className="h-4 w-4 text-zinc-500" />
                    </Button>
                    <Button
                      plain
                      aria-label={t("sil")}
                      title={t("sil")}
                      onClick={() => handleDelete(a)}
                    >
                      <Trash2 className="h-4 w-4 text-red-500" />
                    </Button>
                  </div>
                ) : null}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge
                  color={
                    a.type === "FATURA"
                      ? "blue"
                      : a.type === "ILETISIM"
                        ? "zinc"
                        : "emerald"
                  }
                >
                  {typeLabel(a.type)}
                </Badge>
                {a.isDefault ? <Badge color="amber">{t("varsayilan")}</Badge> : null}
              </div>
              <div className="mt-1.5 text-xs text-zinc-500">
                {a.addressLine}
                {a.district ? `, ${a.district}` : ""}
                {a.city ? `, ${a.city}` : ""}
              </div>
              {a.type === "FATURA" && (a.taxOffice || a.taxNumber) ? (
                <div className="mt-0.5 text-xs text-zinc-500">
                  {t("vdVkn", { taxOffice: a.taxOffice ?? "—", taxNumber: a.taxNumber ?? "—" })}
                </div>
              ) : null}
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
  const t = useTranslations("web.panel.settings.addressBookSection");
  const locale = useLocale() as Locale;
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
  const [touched, setTouched] = useState(false);

  // Satır içi hatalar — backend DTO ile aynı zorunluluk (title/addressLine
  // MinLength 1); telefon tek kaynak `isValidPhone`.
  const titleError = f.title.trim() ? null : t("baslikZorunlu");
  const addressError = f.addressLine.trim() ? null : t("acikAdresZorunlu");
  const phoneError = isValidPhone(f.phone) ? null : t("gecerliBirTelefonNumarasiGiriniz");
  const hasError = Boolean(titleError || addressError || phoneError);

  const submit = async () => {
    setTouched(true);
    if (hasError) return;
    // Fatura adresinde vergi dairesi/no ve TR VKN/TCKN formatı ESKİDEN zorunluydu
    // ama backend (company-address.dto) bu alanları @IsOptional tutar ve format
    // doğrulamaz — frontend backend'den katı olmamalı (backend otoritedir). Bloklama
    // kaldırıldı; alanlar hâlâ formda ve girildiğinde kaydedilir.
    try {
      await save.mutateAsync({ id: address?.id, ...f });
      toast.success(address ? t("adresGuncellendi") : t("adresEklendi"));
      onClose();
    } catch (err) {
      toast.error(extractErrorMessage(err, t("kaydedilemedi")));
    }
  };

  return (
    <Dialog open onClose={onClose} size="2xl">
      <DialogTitle>{address ? t("adresiDuzenle") : t("yeniAdres")}</DialogTitle>
      <DialogBody className="space-y-4">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field>
            <Label>{t("adresTipi")}</Label>
            <Select
              value={f.type}
              onChange={(e) => {
                const type = e.target.value as CompanyAddressType;
                // Fatura dışına geçince vergi alanları gövdede kalmasın.
                set(type === "FATURA" ? { type } : { type, taxOffice: "", taxNumber: "" });
              }}
            >
              <option value="TESLIMAT">{t("teslimat")}</option>
              <option value="FATURA">{t("fatura")}</option>
              <option value="ILETISIM">{t("iletisim")}</option>
            </Select>
          </Field>
          <Field>
            <Label>{t("baslik")}</Label>
            <Input
              value={f.title}
              invalid={touched && Boolean(titleError)}
              onChange={(e) => set({ title: e.target.value })}
              placeholder={t("merkezDepo")}
            />
            {touched && titleError ? <ErrorMessage>{titleError}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>{t("ilgiliKisi")}</Label>
            <Input
              value={f.contactName}
              onChange={(e) => set({ contactName: e.target.value })}
            />
          </Field>
          <Field>
            <Label>{t("telefon")}</Label>
            <PhoneInput value={f.phone} onChange={(v) => set({ phone: v })} />
            {touched && phoneError ? <ErrorMessage>{phoneError}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>{t("ulke")}</Label>
            <Select
              value={f.country}
              onChange={(e) => set({ country: e.target.value })}
            >
              {COUNTRIES.map((c) => (
                <option key={c.code} value={c.code}>
                  {countryDisplayName(c.code, locale)}
                </option>
              ))}
            </Select>
          </Field>
          <Field>
            <Label>{t("il")}</Label>
            <Input
              value={f.city}
              onChange={(e) => set({ city: e.target.value })}
            />
          </Field>
          <Field>
            <Label>{t("ilce")}</Label>
            <Input
              value={f.district}
              onChange={(e) => set({ district: e.target.value })}
            />
          </Field>
        </div>
        <Field>
          <Label>{t("acikAdres")}</Label>
          <Textarea
            rows={2}
            value={f.addressLine}
            invalid={touched && Boolean(addressError)}
            onChange={(e) => set({ addressLine: e.target.value })}
          />
          {touched && addressError ? <ErrorMessage>{addressError}</ErrorMessage> : null}
        </Field>
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <Field>
            <Label>{t("postaKodu")}</Label>
            <Input
              value={f.postalCode}
              onChange={(e) => set({ postalCode: e.target.value })}
            />
          </Field>
          {f.type === "FATURA" ? (
            <>
              <Field>
                <Label>{t("vergiDairesi")}</Label>
                <Input
                  value={f.taxOffice}
                  onChange={(e) => set({ taxOffice: e.target.value })}
                />
              </Field>
              <Field>
                <Label>{t("vergiNo")}</Label>
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
          {t("buTipIcinVarsayilanAdres")}
        </label>
      </DialogBody>
      <DialogActions>
        <Button plain onClick={onClose}>
          {t("vazgec")}
        </Button>
        <Button onClick={submit} disabled={save.isPending}>
          {save.isPending ? t("kaydediliyor") : address ? t("kaydet") : t("ekle")}
        </Button>
      </DialogActions>
    </Dialog>
  );
}
