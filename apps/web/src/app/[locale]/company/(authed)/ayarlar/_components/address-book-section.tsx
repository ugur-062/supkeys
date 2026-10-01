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
import { cleanPostal, isInvalidTrPostal } from "@/lib/company/postal-code";
import { useConfirm } from "@/components/providers/confirm-dialog";
import {
  useAddresses,
  useDeleteAddress,
  useSaveAddress,
  type CompanyAddress,
  type CompanyAddressType,
} from "@/hooks/use-company-addresses";
import { extractErrorMessage } from "@/lib/tenders/error";
import { CountryCombobox } from "@/components/ui/country-combobox";
import { CityCombobox } from "@/components/ui/city-combobox";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { Pencil, Trash2 } from "lucide-react";
import { useMemo, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";
import { toast } from "sonner";

const TYPE_ORDER: CompanyAddressType[] = ["FATURA", "TESLIMAT", "ILETISIM"];

/** Liste ilk bu kadar kartı çizer, "Daha fazla göster" aynı adımla açar (D-135). */
const PAGE_SIZE = 20;
/** Bu sayının üstünde arama kutusu görünür — az adreste gürültü olmasın. */
const SEARCH_MIN = 6;

export function AddressBookSection({ canManage }: { canManage: boolean }) {
  const t = useTranslations("web.panel.settings.addressBookSection");
  const listLocale = useLocale() as Locale;
  const typeLabel = (type: CompanyAddressType) =>
    type === "FATURA" ? t("fatura") : type === "ILETISIM" ? t("iletisim") : t("teslimat");
  const { data: addresses, isLoading, isError, refetch } = useAddresses();
  const del = useDeleteAddress();
  const confirm = useConfirm();
  const [editing, setEditing] = useState<CompanyAddress | "new" | null>(null);
  const [query, setQuery] = useState("");
  const [limit, setLimit] = useState(PAGE_SIZE);

  // Sıra: tip (Fatura → Teslimat → İletişim), tip içinde varsayılan önce.
  // Arama istemcide (başlık, kişi, adres alanları, tip adı); tavan API'de (D-135).
  const sorted = useMemo(
    () =>
      [...(addresses ?? [])].sort(
        (a, b) =>
          TYPE_ORDER.indexOf(a.type) - TYPE_ORDER.indexOf(b.type) ||
          Number(b.isDefault) - Number(a.isDefault),
      ),
    [addresses],
  );
  const q = query.trim().toLocaleLowerCase(listLocale);
  const filtered = q
    ? sorted.filter((a) =>
        [a.title, a.contactName, a.addressLine, a.district, a.city, a.stateRegion, a.postalCode, typeLabel(a.type)]
          .filter(Boolean)
          .some((v) => String(v).toLocaleLowerCase(listLocale).includes(q)),
      )
    : sorted;
  const visible = filtered.slice(0, limit);

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
        <>
        {addresses.length > SEARCH_MIN ? (
          <div className="mt-4 flex flex-wrap items-center gap-3">
            <Input
              type="search"
              value={query}
              aria-label={t("adresAra")}
              placeholder={t("adresAra")}
              maxLength={80}
              onChange={(e) => {
                setQuery(e.target.value);
                setLimit(PAGE_SIZE);
              }}
              className="max-w-sm"
            />
            <Text className="text-xs text-zinc-500">
              {t("adresSayisi", { count: filtered.length })}
            </Text>
          </div>
        ) : null}
        {filtered.length === 0 ? (
          <Text className="mt-3 text-sm text-zinc-500">{t("aramaSonucYok")}</Text>
        ) : null}
        {/* grid-cols-1 = minmax(0,1fr): örtük sütun en geniş içeriğe göre
            büyüyüp 375 px'te kartları taşırıyordu (yayın denetimi Bölüm 12). */}
        <div className="mt-4 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {visible.map((a) => (
            <div
              key={a.id}
              className="min-w-0 rounded-lg border border-zinc-200 p-4"
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
                {/* Ülke her adreste görünür (2026-09-27, kayıt tüm ülkelere açık). */}
                {[a.addressLine, a.district, a.city, a.stateRegion, a.postalCode, countryDisplayName(a.country, listLocale)]
                  .filter(Boolean)
                  .join(", ")}
              </div>
              {/* Vergi dairesi Türkiye'ye özgü: yabancı adreste (ya da dairesiz
                  kayıtta) "VD: —" değil yalnız vergi no (D-137). */}
              {a.type === "FATURA" && (a.taxOffice || a.taxNumber) ? (
                <div className="mt-0.5 text-xs text-zinc-500">
                  {a.country === "TR" && a.taxOffice
                    ? t("vdVkn", { taxOffice: a.taxOffice, taxNumber: a.taxNumber ?? "—" })
                    : a.taxNumber
                      ? t("vkn", { taxNumber: a.taxNumber })
                      : null}
                </div>
              ) : null}
            </div>
          ))}
        </div>
        {filtered.length > visible.length ? (
          <div className="mt-3 flex justify-center">
            <Button plain onClick={() => setLimit((n) => n + PAGE_SIZE)}>
              {t("dahaFazlaGoster", { count: filtered.length - visible.length })}
            </Button>
          </div>
        ) : null}
        </>
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
  const save = useSaveAddress();
  // Çift tık iki adres açmasın (arayüz testi FX-00 O-001).
  const lock = useSubmitLock();
  // Yeni adresin ülkesi varsayılan olarak firmanın ülkesi (eskiden her zaman TR).
  const companyCountry = useCompanyAuthStore((st) => st.company?.country) ?? "TR";
  const [f, setF] = useState({
    type: address?.type ?? ("TESLIMAT" as CompanyAddressType),
    title: address?.title ?? "",
    contactName: address?.contactName ?? "",
    phone: address?.phone ?? "",
    country: address?.country ?? companyCountry,
    stateRegion: address?.stateRegion ?? "",
    city: address?.city ?? "",
    cityId: address?.cityId ?? (null as number | null),
    district: address?.district ?? "",
    addressLine: address?.addressLine ?? "",
    postalCode: address?.postalCode ?? "",
    taxOffice: address?.taxOffice ?? "",
    taxNumber: address?.taxNumber ?? "",
    isDefault: address?.isDefault ?? false,
  });
  const set = (patch: Partial<typeof f>) => setF((p) => ({ ...p, ...patch }));
  const [touched, setTouched] = useState(false);
  const isTR = f.country === "TR";

  // Satır içi hatalar — backend DTO ile aynı zorunluluk (title/addressLine
  // MinLength 1); telefon tek kaynak `isValidPhone`.
  const titleError = f.title.trim() ? null : t("baslikZorunlu");
  const addressError = f.addressLine.trim() ? null : t("acikAdresZorunlu");
  const phoneError = isValidPhone(f.phone) ? null : t("gecerliBirTelefonNumarasiGiriniz");
  // TR posta kodu 5 rakam — API `assertPostalCode` ile aynı (D-133); boş serbest.
  // API gibi yalnız DEĞİŞEN değerde: kuraldan önceki kayıt başlık düzeltmesini kilitlemesin.
  const postalChanged =
    !address || f.postalCode !== (address.postalCode ?? "") || f.country !== address.country;
  const postalError =
    isTR && postalChanged && isInvalidTrPostal(f.postalCode) ? t("postaKodu5Hane") : null;
  const hasError = Boolean(titleError || addressError || phoneError || postalError);

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
      {/* Form + Enter ile gönderim (arayüz testi D-307). */}
      <form
        noValidate
        onSubmit={(e) => {
          e.preventDefault();
          void lock.run(submit);
        }}
      >
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
              maxLength={120}
            />
            {touched && titleError ? <ErrorMessage>{titleError}</ErrorMessage> : null}
          </Field>
          <Field>
            <Label>{t("ilgiliKisi")}</Label>
            <Input
              value={f.contactName}
              maxLength={120}
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
            <CountryCombobox
              value={f.country}
              ariaLabel={t("ulke")}
              onChange={(country) =>
                set(
                  country === "TR"
                    ? { country, stateRegion: "", city: "", cityId: null, postalCode: cleanPostal(f.postalCode, true) }
                    : { country, taxOffice: "", district: "", city: "", cityId: null },
                )
              }
            />
          </Field>
          <Field>
            <Label>{isTR ? t("il") : t("sehir")}</Label>
            <CityCombobox
              country={f.country}
              value={f.city}
              ariaLabel={isTR ? t("il") : t("sehir")}
              onChange={({ city, cityId }) => set({ city, cityId })}
            />
          </Field>
          {/* TR: ilçe; diğer ülkeler: eyalet/bölge (Bayern, Maharashtra…). */}
          {isTR ? (
            <Field>
              <Label>{t("ilce")}</Label>
              <Input
                value={f.district}
                maxLength={80}
                onChange={(e) => set({ district: e.target.value })}
              />
            </Field>
          ) : (
            <Field>
              <Label>{t("eyaletBolge")}</Label>
              <Input
                value={f.stateRegion}
                maxLength={100}
                onChange={(e) => set({ stateRegion: e.target.value })}
              />
            </Field>
          )}
        </div>
        <Field>
          <Label>{t("acikAdres")}</Label>
          <Textarea
            rows={2}
            value={f.addressLine}
            maxLength={500}
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
              inputMode={isTR ? "numeric" : undefined}
              maxLength={isTR ? 5 : 20}
              invalid={touched && Boolean(postalError)}
              onChange={(e) => set({ postalCode: cleanPostal(e.target.value, isTR) })}
            />
            {touched && postalError ? <ErrorMessage>{postalError}</ErrorMessage> : null}
          </Field>
          {f.type === "FATURA" ? (
            <>
              {/* Vergi dairesi Türkiye'ye özgü. */}
              {isTR ? (
                <Field>
                  <Label>{t("vergiDairesi")}</Label>
                  <Input
                    value={f.taxOffice}
                    maxLength={120}
                    onChange={(e) => set({ taxOffice: e.target.value })}
                  />
                </Field>
              ) : null}
              <Field>
                <Label>{isTR ? t("vergiNo") : t("vergiNoYabanci")}</Label>
                <Input
                  value={f.taxNumber}
                  maxLength={30}
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
        <Button type="submit" disabled={save.isPending || lock.locked}>
          {save.isPending || lock.locked ? t("kaydediliyor") : address ? t("kaydet") : t("ekle")}
        </Button>
      </DialogActions>
      </form>
    </Dialog>
  );
}
