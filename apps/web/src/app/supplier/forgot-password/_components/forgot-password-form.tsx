"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { api } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { CheckCircle2 } from "lucide-react";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z.object({
  email: z.string().email("Geçerli bir e-posta giriniz"),
});

type Values = z.infer<typeof schema>;

export function SupplierForgotPasswordForm() {
  const [submitting, setSubmitting] = useState(false);
  const [sentTo, setSentTo] = useState<string | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(schema) });

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      // Tedarikçi domain endpoint'i — SupplierUser'ı email ile bulup bizim
      // token sistemiyle reset linki gönderir. Var/yok ayrımı sızdırılmaz.
      await api.post("/supplier-auth/forgot-password", { email: values.email });
      setSentTo(values.email);
    } catch {
      toast.error("Bir sorun oluştu, lütfen tekrar deneyin");
    } finally {
      setSubmitting(false);
    }
  };

  if (sentTo) {
    return (
      <div className="space-y-4 text-center py-4">
        <CheckCircle2 className="w-12 h-12 mx-auto text-emerald-500" />
        <h2 className="font-display font-semibold text-lg text-zinc-900">
          E-posta gönderildi
        </h2>
        <p className="text-sm text-slate-600">
          <span className="font-medium text-zinc-900">{sentTo}</span> adresine
          bir şifre sıfırlama bağlantısı gönderdik. Linkin geçerlilik süresi
          1 saat.
        </p>
        <p className="text-xs text-slate-500">
          E-postayı görmüyorsan spam klasörünü kontrol et veya birkaç dakika
          sonra tekrar dene.
        </p>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="space-y-5"
      noValidate
    >
      <Field error={errors.email?.message}>
        <Label htmlFor="email" required>
          E-posta
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="ornek@firma.com"
          autoComplete="email"
          autoFocus
          hasError={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Button type="submit" fullWidth loading={submitting}>
        Sıfırlama Bağlantısı Gönder
      </Button>
    </form>
  );
}
