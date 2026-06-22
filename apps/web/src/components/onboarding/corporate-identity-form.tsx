"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { zodResolver } from "@hookform/resolvers/zod";
import { isValidEmailLike, isValidIbanTr, isValidMersis } from "@supkeys/shared";
import { Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { z } from "zod";

export interface LockedItem {
  label: string;
  value: string | null;
}

export type VerificationStatus =
  | "UNVERIFIED"
  | "PENDING"
  | "VERIFIED"
  | "REJECTED";

export interface CorporateIdentityValues {
  mersisNo: string;
  tradeRegistryNo: string;
  kepAddress: string;
  iban: string;
  ibanHolder: string;
}

const INVALID = "Bu değer geçersiz.";

const schema = z
  .object({
    mersisNo: z.string(),
    tradeRegistryNo: z.string(),
    kepAddress: z.string(),
    iban: z.string(),
    ibanHolder: z.string(),
  })
  .superRefine((v, ctx) => {
    if (!isValidMersis(v.mersisNo)) {
      ctx.addIssue({
        path: ["mersisNo"],
        code: z.ZodIssueCode.custom,
        message: INVALID,
      });
    }
    if (v.kepAddress.trim() && !isValidEmailLike(v.kepAddress)) {
      ctx.addIssue({
        path: ["kepAddress"],
        code: z.ZodIssueCode.custom,
        message: INVALID,
      });
    }
    if (v.iban.trim() && !isValidIbanTr(v.iban)) {
      ctx.addIssue({
        path: ["iban"],
        code: z.ZodIssueCode.custom,
        message: INVALID,
      });
    }
  });

const STATUS_BADGE: Record<VerificationStatus, { label: string; cls: string }> =
  {
    UNVERIFIED: {
      label: "Doğrulanmadı",
      cls: "bg-zinc-100 text-zinc-700",
    },
    PENDING: { label: "İnceleniyor", cls: "bg-amber-100 text-amber-800" },
    VERIFIED: { label: "Doğrulandı", cls: "bg-success-100 text-success-700" },
    REJECTED: { label: "Reddedildi", cls: "bg-rose-100 text-rose-700" },
  };

export function CorporateIdentityForm({
  lockedItems,
  verificationStatus,
  initial,
  saving,
  onSave,
}: {
  lockedItems: LockedItem[];
  verificationStatus: VerificationStatus;
  initial: CorporateIdentityValues;
  saving: boolean;
  onSave: (values: CorporateIdentityValues) => void;
}) {
  const {
    register,
    handleSubmit,
    formState: { errors, isDirty },
  } = useForm<CorporateIdentityValues>({
    resolver: zodResolver(schema),
    mode: "onBlur",
    defaultValues: initial,
  });

  const badge = STATUS_BADGE[verificationStatus];

  return (
    <div className="space-y-6">
      {/* Kilitli bilgiler */}
      <section className="rounded-2xl border border-zinc-950/10 bg-white p-6">
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Lock className="h-4 w-4 text-zinc-400" />
            <h2 className="text-base font-semibold text-zinc-900">
              Doğrulanmış Bilgiler
            </h2>
          </div>
          <span
            className={`rounded-md px-2 py-0.5 text-xs font-semibold ${badge.cls}`}
          >
            {badge.label}
          </span>
        </div>
        <p className="mb-4 text-xs text-zinc-500">
          Kilitli alanlar doğrulama kaydı olarak korunur ve değiştirilemez.
        </p>
        <dl className="grid grid-cols-1 gap-x-6 gap-y-3 sm:grid-cols-2">
          {lockedItems.map((it) => (
            <div key={it.label} className="flex flex-col">
              <dt className="text-xs text-zinc-500">{it.label}</dt>
              <dd className="text-sm font-medium text-zinc-900">
                {it.value || "—"}
              </dd>
            </div>
          ))}
        </dl>
      </section>

      {/* Editlenebilir kurumsal kimlik */}
      <form
        onSubmit={handleSubmit(onSave)}
        className="rounded-2xl border border-zinc-950/10 bg-white p-6"
      >
        <h2 className="mb-1 text-base font-semibold text-zinc-900">
          Kurumsal Kimlik
        </h2>
        <p className="mb-4 text-xs text-zinc-500">
          MERSİS, ticaret sicil, KEP ve banka bilgilerinizi tamamlayın.
        </p>
        <div className="grid grid-cols-1 gap-5 md:grid-cols-2">
          <Field error={errors.mersisNo?.message} hint="Boş veya 16 hane">
            <Label>MERSİS No</Label>
            <Input
              {...register("mersisNo")}
              inputMode="numeric"
              maxLength={16}
              placeholder="16 haneli MERSİS no"
            />
          </Field>
          <Field error={errors.tradeRegistryNo?.message}>
            <Label>Ticaret Sicil No</Label>
            <Input
              {...register("tradeRegistryNo")}
              placeholder="Ticaret sicil no"
            />
          </Field>
          <Field error={errors.kepAddress?.message} hint="örn. ornek@hs01.kep.tr">
            <Label>KEP Adresi</Label>
            <Input {...register("kepAddress")} placeholder="KEP e-posta" />
          </Field>
          <Field error={errors.iban?.message} hint="TR, 26 hane">
            <Label>IBAN</Label>
            <Input
              {...register("iban")}
              placeholder="TR.. .... .... .... .... .... .."
            />
          </Field>
          <Field error={errors.ibanHolder?.message}>
            <Label>IBAN Sahibi</Label>
            <Input
              {...register("ibanHolder")}
              placeholder="Hesap sahibinin tam adı"
            />
          </Field>
        </div>
        <div className="mt-6 flex items-center justify-end border-t border-zinc-100 pt-4">
          <Button type="submit" loading={saving} disabled={saving || !isDirty}>
            Bilgileri Kaydet
          </Button>
        </div>
      </form>
    </div>
  );
}
