"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenantUserMe, useUpdateMe } from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserMe } from "@/lib/users/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { Loader2, Pencil } from "lucide-react";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BackToSettings } from "./back-to-settings";

const schema = z.object({
  firstName: z.string().min(2, "En az 2 karakter").max(80),
  lastName: z.string().min(2, "En az 2 karakter").max(80),
  phone: z
    .string()
    .max(40, "En fazla 40 karakter")
    .optional()
    .or(z.literal("")),
});

type FormValues = z.infer<typeof schema>;

export function HesapBilgileriView() {
  const meQuery = useTenantUserMe();
  const updateMutation = useUpdateMe();
  const [editing, setEditing] = useState(false);

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: { firstName: "", lastName: "", phone: "" },
  });

  // me yüklendiğinde formu doldur
  useEffect(() => {
    if (meQuery.data) {
      form.reset({
        firstName: meQuery.data.firstName,
        lastName: meQuery.data.lastName,
        phone: meQuery.data.phone ?? "",
      });
    }
  }, [meQuery.data, form]);

  if (meQuery.isLoading || !meQuery.data) {
    return (
      <div className="max-w-2xl mx-auto px-6 py-12 flex items-center justify-center text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Yükleniyor…
      </div>
    );
  }

  const me = meQuery.data;

  const onSubmit = (values: FormValues) => {
    updateMutation.mutate(
      {
        firstName: values.firstName,
        lastName: values.lastName,
        phone: values.phone?.trim() || undefined,
      },
      {
        onSuccess: () => {
          toast.success("Bilgileriniz güncellendi");
          setEditing(false);
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Güncelleme başarısız"));
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              Hesap Bilgileri
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Kişisel bilgilerinizi güncelleyin.
            </p>
          </div>
          {!editing ? (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => setEditing(true)}
            >
              <Pencil className="h-4 w-4" />
              Düzenle
            </Button>
          ) : null}
        </div>

        {!editing ? (
          <ReadOnlyView me={me} />
        ) : (
          <form
            onSubmit={form.handleSubmit(onSubmit)}
            className="space-y-4"
            noValidate
          >
            <Field>
              <Label htmlFor="email">E-posta</Label>
              <Input
                id="email"
                value={me.email}
                disabled
                className="bg-surface-muted"
              />
              <p className="text-xs text-slate-400 mt-1">
                E-posta adresi değiştirilemez.
              </p>
            </Field>

            <Field error={form.formState.errors.firstName?.message}>
              <Label htmlFor="firstName">Ad</Label>
              <Input
                id="firstName"
                hasError={!!form.formState.errors.firstName}
                {...form.register("firstName")}
              />
            </Field>

            <Field error={form.formState.errors.lastName?.message}>
              <Label htmlFor="lastName">Soyad</Label>
              <Input
                id="lastName"
                hasError={!!form.formState.errors.lastName}
                {...form.register("lastName")}
              />
            </Field>

            <Field
              error={form.formState.errors.phone?.message}
              hint="Opsiyonel — örn. +90 5XX XXX XX XX"
            >
              <Label htmlFor="phone">Telefon</Label>
              <Input
                id="phone"
                hasError={!!form.formState.errors.phone}
                {...form.register("phone")}
              />
            </Field>

            <div className="flex items-center gap-2 pt-2">
              <Button
                type="submit"
                variant="primary"
                loading={updateMutation.isPending}
                disabled={updateMutation.isPending}
              >
                Kaydet
              </Button>
              <Button
                type="button"
                variant="ghost"
                onClick={() => {
                  setEditing(false);
                  form.reset({
                    firstName: me.firstName,
                    lastName: me.lastName,
                    phone: me.phone ?? "",
                  });
                }}
                disabled={updateMutation.isPending}
              >
                İptal
              </Button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}

function ReadOnlyView({ me }: { me: TenantUserMe }) {
  return (
    <dl className="space-y-4">
      <Row label="E-posta" value={me.email} hint="Değiştirilemez" />
      <Row label="Ad" value={me.firstName} />
      <Row label="Soyad" value={me.lastName} />
      <Row label="Telefon" value={me.phone || "—"} />
      <Row label="Rol" value={roleLabel(me.role)} />
    </dl>
  );
}

function Row({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div>
      <dt className="text-[11px] uppercase tracking-wide text-slate-500 font-semibold">
        {label}
      </dt>
      <dd className="text-sm text-brand-900 mt-1 font-medium">{value}</dd>
      {hint ? <p className="text-xs text-slate-400 mt-0.5">{hint}</p> : null}
    </div>
  );
}
