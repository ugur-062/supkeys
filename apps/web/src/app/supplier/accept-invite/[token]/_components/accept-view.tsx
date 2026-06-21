"use client";

import { SupkeysLogo } from "@/components/brand/logo";
import { Alert } from "@/components/ui/alert";
import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  useAcceptSupplierInvitation,
  useSupplierInvitation,
} from "@/hooks/use-supplier-team";
import { useSupplierAuthStore } from "@/lib/supplier-auth/store";
import { extractErrorMessage } from "@/lib/tenders/error";
import { zodResolver } from "@hookform/resolvers/zod";
import { AlertCircle, Loader2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    firstName: z.string().min(2, "En az 2 karakter").max(80),
    lastName: z.string().min(2, "En az 2 karakter").max(80),
    phone: z.string().max(40).optional().or(z.literal("")),
    password: z
      .string()
      .min(8, "En az 8 karakter")
      .max(72, "En fazla 72 karakter")
      .regex(/(?=.*[a-z])(?=.*[A-Z])(?=.*\d)/, {
        message: "Şifre en az 1 büyük, 1 küçük harf ve 1 rakam içermeli",
      }),
    confirmPassword: z.string(),
  })
  .refine((d) => d.password === d.confirmPassword, {
    message: "Şifreler eşleşmiyor",
    path: ["confirmPassword"],
  });

type FormValues = z.infer<typeof schema>;

export function AcceptView({ token }: { token: string }) {
  const router = useRouter();
  const setAuth = useSupplierAuthStore((s) => s.setAuth);
  const invitationQuery = useSupplierInvitation(token);
  const acceptMutation = useAcceptSupplierInvitation();

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    defaultValues: {
      firstName: "",
      lastName: "",
      phone: "",
      password: "",
      confirmPassword: "",
    },
  });

  if (invitationQuery.isLoading) {
    return (
      <CenteredCard>
        <div className="flex items-center justify-center text-slate-500 py-8">
          <Loader2 className="h-5 w-5 animate-spin mr-2" />
          Davet bilgisi yükleniyor…
        </div>
      </CenteredCard>
    );
  }

  if (!invitationQuery.data) {
    const status = (
      invitationQuery.error as { response?: { status?: number } }
    )?.response?.status;
    let detail =
      "Bu davet bağlantısı geçersiz, iptal edilmiş veya süresi dolmuş olabilir.";
    if (status === 409) {
      detail =
        "Bu davet artık geçerli değil — kabul edilmiş, iptal edilmiş veya süresi dolmuş olabilir.";
    }
    return (
      <CenteredCard>
        <Alert variant="danger" title="Davet geçersiz">
          {detail}
        </Alert>
        <div className="flex gap-2 mt-4">
          <Link href="/supplier/login" className="flex-1">
            <Button variant="primary" className="w-full">
              Giriş Yap
            </Button>
          </Link>
        </div>
      </CenteredCard>
    );
  }

  const invitation = invitationQuery.data;

  const onSubmit = (values: FormValues) => {
    acceptMutation.mutate(
      {
        token,
        payload: {
          firstName: values.firstName,
          lastName: values.lastName,
          password: values.password,
          phone: values.phone?.trim() || undefined,
        },
      },
      {
        onSuccess: (data) => {
          setAuth({
            token: data.token,
            supplierUser: data.supplierUser,
            supplier: data.supplier,
          });
          toast.success(
            `Hoş geldiniz! ${invitation.companyName} ekibine eklendiniz.`,
          );
          router.push("/supplier/dashboard");
        },
        onError: (err) => {
          toast.error(extractErrorMessage(err, "Davet kabul edilemedi"));
        },
      },
    );
  };

  return (
    <CenteredCard>
      <div className="text-center mb-6">
        <SupkeysLogo variant="full" size="md" className="mx-auto" />
        <h1 className="text-2xl font-semibold text-zinc-900 mt-4">
          Ekibe Katılın
        </h1>
        <p className="text-slate-600 text-sm mt-2">
          <strong>{invitation.companyName}</strong> firmasının Supkeys ekibine
          davet edildiniz. Bilgilerinizi doldurarak katılın.
        </p>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-3"
        noValidate
      >
        <Field hint="Davet edildiğiniz e-posta — değiştirilemez">
          <Label htmlFor="ai-email">E-posta</Label>
          <Input
            id="ai-email"
            value={invitation.email}
            disabled
            className="bg-surface-muted"
          />
        </Field>

        <div className="grid grid-cols-2 gap-2">
          <Field error={form.formState.errors.firstName?.message}>
            <Label htmlFor="ai-firstName">Ad</Label>
            <Input
              id="ai-firstName"
              hasError={!!form.formState.errors.firstName}
              {...form.register("firstName")}
            />
          </Field>
          <Field error={form.formState.errors.lastName?.message}>
            <Label htmlFor="ai-lastName">Soyad</Label>
            <Input
              id="ai-lastName"
              hasError={!!form.formState.errors.lastName}
              {...form.register("lastName")}
            />
          </Field>
        </div>

        <Field
          error={form.formState.errors.phone?.message}
          hint="Opsiyonel — örn. 0212 000 00 00"
        >
          <Label htmlFor="ai-phone">Telefon</Label>
          <Input id="ai-phone" {...form.register("phone")} />
        </Field>

        <Field
          error={form.formState.errors.password?.message}
          hint="En az 8 karakter, 1 büyük + 1 küçük harf + 1 rakam"
        >
          <Label htmlFor="ai-password">Şifre</Label>
          <Input
            id="ai-password"
            type="password"
            autoComplete="new-password"
            hasError={!!form.formState.errors.password}
            {...form.register("password")}
          />
        </Field>

        <Field error={form.formState.errors.confirmPassword?.message}>
          <Label htmlFor="ai-confirm">Şifre (Tekrar)</Label>
          <Input
            id="ai-confirm"
            type="password"
            autoComplete="new-password"
            hasError={!!form.formState.errors.confirmPassword}
            {...form.register("confirmPassword")}
          />
        </Field>

        <Button
          type="submit"
          variant="primary"
          loading={acceptMutation.isPending}
          disabled={acceptMutation.isPending}
          className="w-full mt-4"
        >
          Daveti Kabul Et
        </Button>
      </form>

      <p className="text-xs text-slate-500 text-center mt-4">
        Zaten hesabınız var mı?{" "}
        <Link
          href="/supplier/login"
          className="text-zinc-600 hover:underline font-semibold"
        >
          Giriş yap
        </Link>
      </p>
    </CenteredCard>
  );
}

function CenteredCard({ children }: { children: React.ReactNode }) {
  return (
    <div className="min-h-screen flex items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-lg p-8">
        {children}
      </div>
    </div>
  );
}
