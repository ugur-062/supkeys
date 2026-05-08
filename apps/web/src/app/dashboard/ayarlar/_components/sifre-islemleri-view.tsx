"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangePassword } from "@/hooks/use-tenant-users";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { Lock } from "lucide-react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";
import { BackToSettings } from "./back-to-settings";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifre gerekli"),
    newPassword: z
      .string()
      .min(8, "En az 8 karakter")
      .max(72, "En fazla 72 karakter"),
    confirmPassword: z.string(),
  })
  .refine((data) => data.newPassword === data.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  })
  .refine((data) => data.currentPassword !== data.newPassword, {
    message: "Yeni şifre eski şifreyle aynı olamaz",
    path: ["newPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function SifreIslemleriView() {
  const changePasswordMutation = useChangePassword();
  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const onSubmit = (values: FormValues) => {
    changePasswordMutation.mutate(
      {
        currentPassword: values.currentPassword,
        newPassword: values.newPassword,
      },
      {
        onSuccess: () => {
          toast.success("Şifreniz başarıyla değiştirildi");
          form.reset();
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Şifre değiştirilemedi"));
        },
      },
    );
  };

  return (
    <div className="max-w-2xl mx-auto px-6 py-8">
      <BackToSettings />

      <div className="mt-4 rounded-2xl border border-slate-200 bg-white p-6">
        <div className="mb-6 flex items-start gap-3">
          <div className="h-10 w-10 rounded-xl bg-brand-50 flex items-center justify-center flex-shrink-0">
            <Lock className="h-5 w-5 text-brand-600" />
          </div>
          <div>
            <h1 className="font-display text-2xl font-bold text-brand-900">
              Şifre İşlemleri
            </h1>
            <p className="text-slate-500 text-sm mt-1">
              Hesabınızın güvenliği için şifrenizi düzenli olarak değiştirin.
            </p>
          </div>
        </div>

        <form
          onSubmit={form.handleSubmit(onSubmit)}
          className="space-y-4"
          noValidate
        >
          <Field error={form.formState.errors.currentPassword?.message}>
            <Label htmlFor="currentPassword">Mevcut Şifre</Label>
            <Input
              id="currentPassword"
              type="password"
              autoComplete="current-password"
              hasError={!!form.formState.errors.currentPassword}
              {...form.register("currentPassword")}
            />
          </Field>

          <Field
            error={form.formState.errors.newPassword?.message}
            hint="En az 8 karakter, en fazla 72 karakter"
          >
            <Label htmlFor="newPassword">Yeni Şifre</Label>
            <Input
              id="newPassword"
              type="password"
              autoComplete="new-password"
              hasError={!!form.formState.errors.newPassword}
              {...form.register("newPassword")}
            />
          </Field>

          <Field error={form.formState.errors.confirmPassword?.message}>
            <Label htmlFor="confirmPassword">Yeni Şifre (Tekrar)</Label>
            <Input
              id="confirmPassword"
              type="password"
              autoComplete="new-password"
              hasError={!!form.formState.errors.confirmPassword}
              {...form.register("confirmPassword")}
            />
          </Field>

          <div className="pt-2">
            <Button
              type="submit"
              variant="primary"
              loading={changePasswordMutation.isPending}
              disabled={changePasswordMutation.isPending}
            >
              Şifreyi Değiştir
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
