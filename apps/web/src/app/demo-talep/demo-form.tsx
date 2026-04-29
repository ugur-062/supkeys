"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { api } from "@/lib/api";
import { zodResolver } from "@hookform/resolvers/zod";
import { useMutation } from "@tanstack/react-query";
import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const demoFormSchema = z.object({
  companyName: z
    .string()
    .min(2, "Firma adı en az 2 karakter olmalı")
    .max(150, "Firma adı 150 karakteri aşamaz"),
  contactName: z
    .string()
    .min(2, "Ad soyad en az 2 karakter olmalı")
    .max(150),
  email: z.string().email("Geçerli bir e-posta giriniz"),
  phone: z
    .string()
    .max(30)
    .optional()
    .or(z.literal("")),
  message: z
    .string()
    .max(2000, "Mesaj 2000 karakteri aşamaz")
    .optional()
    .or(z.literal("")),
});

type DemoFormValues = z.infer<typeof demoFormSchema>;

interface SubmittedState {
  id: string;
  submittedAt: string;
}

export function DemoForm() {
  const [submitted, setSubmitted] = useState<SubmittedState | null>(null);

  const {
    register,
    handleSubmit,
    formState: { errors },
    reset,
  } = useForm<DemoFormValues>({
    resolver: zodResolver(demoFormSchema),
  });

  const mutation = useMutation({
    mutationFn: async (values: DemoFormValues) => {
      const payload = {
        ...values,
        phone: values.phone || undefined,
        message: values.message || undefined,
        source: "landing_page",
      };
      const { data } = await api.post<{
        id: string;
        message: string;
        submittedAt: string;
      }>("/demo-requests", payload);
      return data;
    },
    onSuccess: (data) => {
      setSubmitted({ id: data.id, submittedAt: data.submittedAt });
      reset();
      toast.success("Talebiniz alındı, en kısa sürede dönüş yapacağız.");
    },
    onError: () => {
      toast.error("Bir sorun oluştu. Lütfen tekrar deneyin.");
    },
  });

  if (submitted) {
    return (
      <div className="card p-8 text-center space-y-4">
        <div className="w-14 h-14 rounded-full bg-success-50 flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-7 h-7 text-success-600" />
        </div>
        <div className="space-y-2">
          <h2 className="text-2xl font-display font-bold text-brand-900">
            Talebiniz alındı 🎉
          </h2>
          <p className="text-slate-600">
            En kısa sürede ekibimizden biri sizinle iletişime geçecek.
          </p>
        </div>
        <div className="text-xs text-slate-400 pt-2 border-t border-surface-border">
          Talep no: <code className="font-mono">{submitted.id.slice(-8)}</code>
        </div>
        <div className="flex gap-2 justify-center pt-2">
          <Button
            variant="secondary"
            onClick={() => setSubmitted(null)}
          >
            Yeni Talep
          </Button>
          <Link href="/" className="btn-primary">
            Ana Sayfaya Dön
          </Link>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={handleSubmit((v) => mutation.mutate(v))}
      className="card p-6 md:p-8 space-y-5"
      noValidate
    >
      <Field error={errors.companyName?.message}>
        <Label htmlFor="companyName" required>
          Firma Adı
        </Label>
        <Input
          id="companyName"
          placeholder="Örn. ABC Tekstil A.Ş."
          hasError={!!errors.companyName}
          {...register("companyName")}
        />
      </Field>

      <Field error={errors.contactName?.message}>
        <Label htmlFor="contactName" required>
          Ad Soyad
        </Label>
        <Input
          id="contactName"
          placeholder="Örn. Ayşe Yılmaz"
          hasError={!!errors.contactName}
          {...register("contactName")}
        />
      </Field>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        <Field error={errors.email?.message}>
          <Label htmlFor="email" required>
            E-posta
          </Label>
          <Input
            id="email"
            type="email"
            placeholder="ayse@firma.com"
            hasError={!!errors.email}
            {...register("email")}
          />
        </Field>

        <Field error={errors.phone?.message} hint="Daha hızlı ulaşalım">
          <Label htmlFor="phone">Telefon</Label>
          <Input
            id="phone"
            type="tel"
            placeholder="+90 555 123 4567"
            hasError={!!errors.phone}
            {...register("phone")}
          />
        </Field>
      </div>

      <Field
        error={errors.message?.message}
        hint="İhtiyaçlarınızdan, ekip büyüklüğünüzden bahsedebilirsiniz"
      >
        <Label htmlFor="message">Mesajınız</Label>
        <Textarea
          id="message"
          placeholder="Sisteminizi denemek istiyoruz..."
          rows={5}
          hasError={!!errors.message}
          {...register("message")}
        />
      </Field>

      <div className="pt-2">
        <Button type="submit" loading={mutation.isPending} fullWidth size="lg">
          {mutation.isPending ? "Gönderiliyor..." : "Demo Talep Et"}
        </Button>
        <p className="text-xs text-slate-500 text-center mt-3">
          Bilgileriniz yalnızca demo süreci için kullanılır.
        </p>
      </div>
    </form>
  );
}
