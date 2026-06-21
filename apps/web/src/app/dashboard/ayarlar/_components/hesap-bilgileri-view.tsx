"use client";

import { Button } from "@/components/ui/button";
import { AvatarInitials } from "@/components/ui/avatar-initials";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useTenantUserMe, useUpdateMe } from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { roleLabel } from "@/lib/users/labels";
import type { TenantUserMe } from "@/lib/users/types";
import { zodResolver } from "@hookform/resolvers/zod";
import { format, formatDistanceToNow } from "date-fns";
import { tr } from "date-fns/locale";
import { Calendar, Clock, Loader2, Mail, Pencil, Shield } from "lucide-react";
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
      <div className="mx-auto flex max-w-3xl items-center justify-center px-6 py-12 text-slate-500">
        <Loader2 className="mr-2 h-5 w-5 animate-spin" />
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
    <div className="mx-auto max-w-3xl px-6 py-8">
      <BackToSettings />

      {/* Üst kart: avatar + meta */}
      <ProfileHeaderCard me={me} />

      {/* İçerik */}
      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm">
        <div className="mb-6 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-brand-900">
              Kişisel Bilgiler
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {editing
                ? "Bilgilerinizi güncelleyin ve kaydet'e tıklayın."
                : "Düzenlemek için sağ üstteki butonu kullanın."}
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
              <p className="mt-1 text-xs text-slate-400">
                E-posta adresi değiştirilemez.
              </p>
            </Field>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
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
            </div>

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

function ProfileHeaderCard({ me }: { me: TenantUserMe }) {
  const fullName = `${me.firstName} ${me.lastName}`.trim();
  return (
    <div className="mt-4 rounded-2xl border border-slate-200 bg-gradient-to-br from-brand-50/40 to-white p-6 shadow-sm">
      <div className="flex flex-wrap items-start gap-4">
        <AvatarInitials name={fullName || me.email} size="lg" />
        <div className="min-w-0 flex-1">
          <p className="text-xl font-semibold text-brand-900">
            {fullName || "—"}
          </p>
          <p className="mt-0.5 text-sm text-slate-500">{me.email}</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className="inline-flex items-center gap-1 rounded-md border border-brand-200 bg-white px-2 py-0.5 font-semibold text-brand-700">
              <Shield className="h-3 w-3" />
              {roleLabel(me.role)}
            </span>
            {me.lastLoginAt ? (
              <span
                className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600"
                title={format(new Date(me.lastLoginAt), "d MMM yyyy HH:mm", {
                  locale: tr,
                })}
              >
                <Clock className="h-3 w-3" />
                Son giriş:{" "}
                {formatDistanceToNow(new Date(me.lastLoginAt), {
                  locale: tr,
                  addSuffix: true,
                })}
              </span>
            ) : null}
            <span className="inline-flex items-center gap-1 rounded-md bg-slate-100 px-2 py-0.5 text-slate-600">
              <Calendar className="h-3 w-3" />
              Üyelik:{" "}
              {format(new Date(me.createdAt), "d MMM yyyy", { locale: tr })}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
}

function ReadOnlyView({ me }: { me: TenantUserMe }) {
  return (
    <dl className="grid grid-cols-1 gap-4 sm:grid-cols-2">
      <Row
        label="E-posta"
        value={me.email}
        icon={Mail}
        hint="Değiştirilemez"
      />
      <Row label="Telefon" value={me.phone || "—"} />
      <Row label="Ad" value={me.firstName} />
      <Row label="Soyad" value={me.lastName} />
    </dl>
  );
}

function Row({
  label,
  value,
  hint,
  icon: Icon,
}: {
  label: string;
  value: string;
  hint?: string;
  icon?: typeof Mail;
}) {
  return (
    <div className="rounded-lg border border-slate-100 bg-slate-50/40 p-3">
      <dt className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        {Icon ? <Icon className="h-3 w-3" /> : null}
        {label}
      </dt>
      <dd className="mt-1 text-sm font-medium text-brand-900">{value}</dd>
      {hint ? <p className="mt-0.5 text-xs text-slate-400">{hint}</p> : null}
    </div>
  );
}
