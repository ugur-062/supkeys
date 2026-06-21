"use client";

import { Button } from "@/components/catalyst/button";
import { Checkbox } from "@/components/catalyst/checkbox";
import {
  Dialog,
  DialogActions,
  DialogBody,
  DialogDescription,
  DialogTitle,
} from "@/components/catalyst/dialog";
import { Radio, RadioGroup } from "@/components/catalyst/radio";
import { Select } from "@/components/catalyst/select";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import {
  useCreateAddress,
  useUpdateAddress,
} from "@/hooks/use-tenant-addresses";
import {
  ADDRESS_TYPE_META,
  type AddressType,
  type CreateAddressPayload,
  type TenantAddress,
} from "@/lib/addresses/types";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { getCityNames, getDistrictsByCity } from "@supkeys/shared";
import { zodResolver } from "@hookform/resolvers/zod";
import { MapPin } from "lucide-react";
import { useEffect, useMemo } from "react";
import { Controller, useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const TYPES: AddressType[] = ["FATURA", "ILETISIM", "TESLIMAT"];

const baseSchema = z.object({
  type: z.enum(["FATURA", "ILETISIM", "TESLIMAT"]),
  title: z.string().min(2, "En az 2 karakter").max(100),
  country: z.string().min(2).max(80),
  city: z.string().min(1, "İl seçin"),
  district: z.string().min(1, "İlçe seçin"),
  fullAddress: z.string().min(10, "En az 10 karakter").max(500),
  postalCode: z.string().max(20).optional().or(z.literal("")),
  taxOffice: z.string().max(100).optional().or(z.literal("")),
  taxNumber: z.string().max(20).optional().or(z.literal("")),
  contactName: z.string().max(100).optional().or(z.literal("")),
  contactPhone: z.string().max(40).optional().or(z.literal("")),
  contactEmail: z
    .string()
    .max(120)
    .email("Geçerli e-posta")
    .optional()
    .or(z.literal("")),
  isDefault: z.boolean().optional(),
  isActive: z.boolean().optional(),
  notes: z.string().max(500).optional().or(z.literal("")),
});

const schema = baseSchema.refine(
  (data) => {
    if (data.type === "FATURA") {
      return (
        !!data.taxOffice &&
        data.taxOffice.trim().length >= 2 &&
        !!data.taxNumber &&
        /^\d{10,11}$/.test(data.taxNumber.trim())
      );
    }
    return true;
  },
  {
    message:
      "Fatura adresi için Vergi Dairesi ve VKN (10-11 rakam) zorunludur",
    path: ["taxNumber"],
  },
);

type FormValues = z.infer<typeof schema>;

interface CreateProps {
  open: boolean;
  onClose: () => void;
  mode: "create";
  defaultType: AddressType;
  address?: never;
}
interface EditProps {
  open: boolean;
  onClose: () => void;
  mode: "edit";
  address: TenantAddress;
  defaultType?: never;
}
type Props = CreateProps | EditProps;

export function AddressFormModal(props: Props) {
  const { open, onClose, mode } = props;
  const isEdit = mode === "edit";
  const createMutation = useCreateAddress();
  const updateMutation = useUpdateAddress();
  const isPending = createMutation.isPending || updateMutation.isPending;

  const cities = useMemo(() => getCityNames(), []);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      type: isEdit ? props.address.type : props.defaultType,
      title: "",
      country: "Türkiye",
      city: "",
      district: "",
      fullAddress: "",
      postalCode: "",
      taxOffice: "",
      taxNumber: "",
      contactName: "",
      contactPhone: "",
      contactEmail: "",
      isDefault: false,
      isActive: true,
      notes: "",
    },
  });

  // open / mode / address değişiminde form'u sıfırla
  useEffect(() => {
    if (!open) return;
    if (isEdit) {
      const a = props.address;
      form.reset({
        type: a.type,
        title: a.title,
        country: a.country,
        city: a.city,
        district: a.district,
        fullAddress: a.fullAddress,
        postalCode: a.postalCode ?? "",
        taxOffice: a.taxOffice ?? "",
        taxNumber: a.taxNumber ?? "",
        contactName: a.contactName ?? "",
        contactPhone: a.contactPhone ?? "",
        contactEmail: a.contactEmail ?? "",
        isDefault: a.isDefault,
        isActive: a.isActive,
        notes: a.notes ?? "",
      });
    } else {
      form.reset({
        type: props.defaultType,
        title: "",
        country: "Türkiye",
        city: "",
        district: "",
        fullAddress: "",
        postalCode: "",
        taxOffice: "",
        taxNumber: "",
        contactName: "",
        contactPhone: "",
        contactEmail: "",
        isDefault: false,
        isActive: true,
        notes: "",
      });
    }
  }, [open, isEdit, props, form]);

  const watchType = form.watch("type");
  const watchCity = form.watch("city");
  const districts = useMemo(
    () => (watchCity ? getDistrictsByCity(watchCity) : []),
    [watchCity],
  );

  const onSubmit = (values: FormValues) => {
    if (isEdit) {
      // type değiştirilemez — payload'tan çıkar
      const payload: Omit<CreateAddressPayload, "type"> & {
        isActive?: boolean;
      } = {
        title: values.title,
        country: values.country,
        city: values.city,
        district: values.district,
        fullAddress: values.fullAddress,
        postalCode: values.postalCode || undefined,
        taxOffice: values.taxOffice || undefined,
        taxNumber: values.taxNumber || undefined,
        contactName: values.contactName || undefined,
        contactPhone: values.contactPhone || undefined,
        contactEmail: values.contactEmail || undefined,
        isDefault: values.isDefault,
        isActive: values.isActive,
        notes: values.notes || undefined,
      };
      updateMutation.mutate(
        { id: props.address.id, payload },
        {
          onSuccess: () => {
            toast.success("Adres güncellendi");
            onClose();
          },
          onError: (err) =>
            toast.error(extractErrorMessage(err, "Güncelleme başarısız")),
        },
      );
      return;
    }

    const createPayload: CreateAddressPayload = {
      type: values.type,
      title: values.title,
      country: values.country,
      city: values.city,
      district: values.district,
      fullAddress: values.fullAddress,
      postalCode: values.postalCode || undefined,
      taxOffice: values.taxOffice || undefined,
      taxNumber: values.taxNumber || undefined,
      contactName: values.contactName || undefined,
      contactPhone: values.contactPhone || undefined,
      contactEmail: values.contactEmail || undefined,
      isDefault: values.isDefault,
      notes: values.notes || undefined,
    };
    createMutation.mutate(createPayload, {
      onSuccess: () => {
        toast.success("Adres eklendi");
        onClose();
      },
      onError: (err) =>
        toast.error(extractErrorMessage(err, "Adres eklenemedi")),
    });
  };

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!isPending) onClose();
      }}
      size="2xl"
    >
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-zinc-100">
          <MapPin className="h-5 w-5 text-zinc-700" />
        </div>
        <div>
          <DialogTitle>
            {isEdit ? "Adresi Düzenle" : "Yeni Adres Ekle"}
          </DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Adres bilgilerini güncelleyin."
              : "İhalede kullanılacak adresi tanımlayın."}
          </DialogDescription>
        </div>
      </div>

      <form onSubmit={form.handleSubmit(onSubmit)} noValidate>
        <DialogBody className="space-y-4">
            {/* Tip seçimi (create) veya read-only (edit) */}
            <Field>
              <Label>
                Adres Tipi {isEdit ? null : <span className="text-danger-500">*</span>}
              </Label>
              {isEdit ? (
                <p className="text-sm text-brand-900 mt-1 font-medium flex items-center gap-2">
                  <span className="text-lg">
                    {ADDRESS_TYPE_META[watchType].emoji}
                  </span>
                  {ADDRESS_TYPE_META[watchType].shortLabel}
                  <span className="text-xs text-slate-400 font-normal">
                    (Tip değiştirilemez)
                  </span>
                </p>
              ) : (
                <Controller
                  control={form.control}
                  name="type"
                  render={({ field }) => (
                    <RadioGroup
                      value={field.value}
                      onChange={field.onChange}
                      className="grid grid-cols-3 gap-2 mt-1"
                    >
                      {TYPES.map((t) => {
                        const meta = ADDRESS_TYPE_META[t];
                        const checked = field.value === t;
                        return (
                          <div
                            key={t}
                            className={cn(
                              "flex flex-col items-center gap-1 p-3 rounded-xl ring-1 transition text-sm",
                              checked
                                ? "ring-2 ring-zinc-900 bg-zinc-50"
                                : "ring-zinc-950/10 bg-white",
                            )}
                          >
                            <Radio value={t} />
                            <span className="text-xl">{meta.emoji}</span>
                            <span className="font-semibold text-zinc-900">
                              {meta.shortLabel}
                            </span>
                          </div>
                        );
                      })}
                    </RadioGroup>
                  )}
                />
              )}
            </Field>

            <Field
              error={form.formState.errors.title?.message}
              hint='Örn. "Genel Merkez", "İstanbul Depo"'
            >
              <Label htmlFor="addr-title">
                Adres Başlığı <span className="text-danger-500">*</span>
              </Label>
              <Input
                id="addr-title"
                hasError={!!form.formState.errors.title}
                {...form.register("title")}
              />
            </Field>

            <Field>
              <Label htmlFor="addr-country">Ülke</Label>
              <Input
                id="addr-country"
                disabled
                className="bg-surface-muted"
                {...form.register("country")}
              />
            </Field>

            <div className="grid grid-cols-2 gap-3">
              <Field error={form.formState.errors.city?.message}>
                <Label htmlFor="addr-city">
                  İl <span className="text-danger-500">*</span>
                </Label>
                <Select
                  id="addr-city"
                  invalid={!!form.formState.errors.city}
                  {...form.register("city", {
                    onChange: () => form.setValue("district", ""),
                  })}
                >
                  <option value="">İl seçin</option>
                  {cities.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </Select>
              </Field>

              <Field error={form.formState.errors.district?.message}>
                <Label htmlFor="addr-district">
                  İlçe <span className="text-danger-500">*</span>
                </Label>
                <Select
                  id="addr-district"
                  disabled={!watchCity}
                  invalid={!!form.formState.errors.district}
                  {...form.register("district")}
                >
                  <option value="">
                    {watchCity ? "İlçe seçin" : "Önce il seçin"}
                  </option>
                  {districts.map((d) => (
                    <option key={d} value={d}>
                      {d}
                    </option>
                  ))}
                </Select>
              </Field>
            </div>

            <Field error={form.formState.errors.fullAddress?.message}>
              <Label htmlFor="addr-full">
                Açık Adres <span className="text-danger-500">*</span>
              </Label>
              <Textarea
                id="addr-full"
                rows={3}
                placeholder="Mahalle, sokak, no, daire"
                hasError={!!form.formState.errors.fullAddress}
                {...form.register("fullAddress")}
              />
            </Field>

            <Field>
              <Label htmlFor="addr-postal">Posta Kodu (opsiyonel)</Label>
              <Input
                id="addr-postal"
                placeholder="34000"
                {...form.register("postalCode")}
              />
            </Field>

            {/* FATURA için Vergi Bilgileri */}
            {watchType === "FATURA" ? (
              <div className="rounded-xl border border-purple-200 bg-purple-50/40 p-4 space-y-3">
                <p className="text-[11px] font-bold text-purple-900 uppercase tracking-wide">
                  Vergi Bilgileri (Fatura için zorunlu)
                </p>
                <div className="grid grid-cols-2 gap-3">
                  <Field error={form.formState.errors.taxOffice?.message}>
                    <Label htmlFor="addr-tax-office">
                      Vergi Dairesi <span className="text-danger-500">*</span>
                    </Label>
                    <Input
                      id="addr-tax-office"
                      placeholder="Üsküdar V.D."
                      hasError={!!form.formState.errors.taxOffice}
                      {...form.register("taxOffice")}
                    />
                  </Field>
                  <Field error={form.formState.errors.taxNumber?.message}>
                    <Label htmlFor="addr-tax-number">
                      Vergi Numarası <span className="text-danger-500">*</span>
                    </Label>
                    <Input
                      id="addr-tax-number"
                      placeholder="1234567890"
                      maxLength={11}
                      hasError={!!form.formState.errors.taxNumber}
                      {...form.register("taxNumber")}
                    />
                  </Field>
                </div>
              </div>
            ) : null}

            {/* İletişim bilgileri */}
            <div className="rounded-xl border border-slate-200 bg-slate-50/40 p-4 space-y-3">
              <p className="text-[11px] font-bold text-slate-700 uppercase tracking-wide">
                İletişim Bilgileri (Opsiyonel)
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Field>
                  <Label htmlFor="addr-contact-name">İlgili Kişi</Label>
                  <Input
                    id="addr-contact-name"
                    placeholder="Ahmet Yılmaz"
                    {...form.register("contactName")}
                  />
                </Field>
                <Field>
                  <Label htmlFor="addr-contact-phone">Telefon</Label>
                  <Input
                    id="addr-contact-phone"
                    placeholder="+90 5XX XXX XX XX"
                    {...form.register("contactPhone")}
                  />
                </Field>
              </div>
              <Field error={form.formState.errors.contactEmail?.message}>
                <Label htmlFor="addr-contact-email">E-posta</Label>
                <Input
                  id="addr-contact-email"
                  type="email"
                  placeholder="muhasebe@firma.com"
                  hasError={!!form.formState.errors.contactEmail}
                  {...form.register("contactEmail")}
                />
              </Field>
            </div>

            <div className="flex items-center gap-3 p-3 rounded-lg border border-warning-200 bg-warning-50">
              <Controller
                control={form.control}
                name="isDefault"
                render={({ field }) => (
                  <Checkbox
                    checked={!!field.value}
                    onChange={field.onChange}
                    onBlur={field.onBlur}
                  />
                )}
              />
              <div>
                <p className="font-semibold text-sm text-warning-900">
                  Default adres olarak ayarla
                </p>
                <p className="text-xs text-warning-700">
                  İhale oluştururken bu adres otomatik seçili gelir.
                </p>
              </div>
            </div>
        </DialogBody>

        <DialogActions>
          <Button plain onClick={onClose} disabled={isPending}>
            Vazgeç
          </Button>
          <Button type="submit" disabled={isPending}>
            {isEdit ? "Kaydet" : "Adres Ekle"}
          </Button>
        </DialogActions>
      </form>
    </Dialog>
  );
}
