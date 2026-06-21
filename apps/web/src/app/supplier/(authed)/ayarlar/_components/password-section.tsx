"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useChangeSupplierPassword } from "@/hooks/use-supplier-account";
import { extractErrorMessage } from "@/lib/tenders/error";
import { cn } from "@/lib/utils";
import { zodResolver } from "@hookform/resolvers/zod";
import { IconButton } from "@/components/ui/icon-button";
import { Check, Eye, EyeOff, Lock, ShieldCheck, X } from "lucide-react";
import { useMemo, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const schema = z
  .object({
    currentPassword: z.string().min(1, "Mevcut şifre gerekli"),
    newPassword: z
      .string()
      .min(8, "En az 8 karakter")
      .max(72, "En fazla 72 karakter")
      .regex(/[A-Z]/, "En az 1 büyük harf (A-Z)")
      .regex(/[a-z]/, "En az 1 küçük harf (a-z)")
      .regex(/\d/, "En az 1 rakam"),
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

const REQUIREMENTS = [
  { key: "min", label: "En az 8 karakter", test: (pw: string) => pw.length >= 8 },
  {
    key: "upper",
    label: "En az 1 büyük harf",
    test: (pw: string) => /[A-Z]/.test(pw),
  },
  {
    key: "lower",
    label: "En az 1 küçük harf",
    test: (pw: string) => /[a-z]/.test(pw),
  },
  { key: "digit", label: "En az 1 rakam", test: (pw: string) => /\d/.test(pw) },
];

function computeStrength(pw: string): { score: 0 | 1 | 2 | 3 | 4; label: string; color: string } {
  if (!pw) return { score: 0, label: "—", color: "bg-slate-200" };
  let score = 0;
  if (pw.length >= 8) score++;
  if (pw.length >= 12) score++;
  if (/[A-Z]/.test(pw) && /[a-z]/.test(pw)) score++;
  if (/\d/.test(pw) && /[^A-Za-z0-9]/.test(pw)) score++;
  const n = Math.min(4, score) as 0 | 1 | 2 | 3 | 4;
  if (n <= 1) return { score: n, label: "Zayıf", color: "bg-danger-500" };
  if (n === 2) return { score: n, label: "Orta", color: "bg-warning-500" };
  if (n === 3) return { score: n, label: "İyi", color: "bg-zinc-500" };
  return { score: n, label: "Güçlü", color: "bg-success-500" };
}

export function PasswordSection() {
  const changeMutation = useChangeSupplierPassword();
  const [show, setShow] = useState({
    current: false,
    next: false,
    confirm: false,
  });

  const form = useForm<FormValues>({
    resolver: zodResolver(schema),
    mode: "onChange",
    defaultValues: {
      currentPassword: "",
      newPassword: "",
      confirmPassword: "",
    },
  });

  const newPw = form.watch("newPassword");
  const strength = useMemo(() => computeStrength(newPw), [newPw]);

  const onSubmit = (values: FormValues) => {
    changeMutation.mutate(
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
    <section className="card p-6">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded-xl bg-zinc-50">
          <Lock className="h-5 w-5 text-zinc-600" />
        </div>
        <div>
          <h2 className="font-semibold text-lg text-zinc-900">
            Şifre Değiştir
          </h2>
          <p className="text-sm text-slate-500 mt-0.5">
            Güvenliğiniz için şifrenizi düzenli olarak yenileyin.
          </p>
        </div>
      </div>

      <form
        onSubmit={form.handleSubmit(onSubmit)}
        className="space-y-4 max-w-lg"
        noValidate
      >
        <Field error={form.formState.errors.currentPassword?.message}>
          <Label htmlFor="currentPassword">Mevcut Şifre</Label>
          <PasswordInput
            id="currentPassword"
            autoComplete="current-password"
            show={show.current}
            onToggleShow={() => setShow((s) => ({ ...s, current: !s.current }))}
            hasError={!!form.formState.errors.currentPassword}
            register={form.register("currentPassword")}
          />
        </Field>

        <Field error={form.formState.errors.newPassword?.message}>
          <Label htmlFor="newPassword">Yeni Şifre</Label>
          <PasswordInput
            id="newPassword"
            autoComplete="new-password"
            show={show.next}
            onToggleShow={() => setShow((s) => ({ ...s, next: !s.next }))}
            hasError={!!form.formState.errors.newPassword}
            register={form.register("newPassword")}
          />
          {newPw ? (
            <div className="mt-2 space-y-2">
              <div className="flex items-center gap-2">
                <div className="flex flex-1 gap-1">
                  {[0, 1, 2, 3].map((i) => (
                    <div
                      key={i}
                      className={cn(
                        "h-1.5 flex-1 rounded-full transition-colors",
                        strength.score > i ? strength.color : "bg-slate-200",
                      )}
                    />
                  ))}
                </div>
                <span className="min-w-[3.5rem] text-right text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                  {strength.label}
                </span>
              </div>
              <ul className="grid grid-cols-1 gap-1 sm:grid-cols-2">
                {REQUIREMENTS.map((req) => {
                  const ok = req.test(newPw);
                  return (
                    <li key={req.key} className="flex items-center gap-1.5 text-xs">
                      {ok ? (
                        <Check className="h-3.5 w-3.5 text-success-600" />
                      ) : (
                        <X className="h-3.5 w-3.5 text-slate-300" />
                      )}
                      <span className={ok ? "text-slate-700" : "text-slate-400"}>
                        {req.label}
                      </span>
                    </li>
                  );
                })}
              </ul>
            </div>
          ) : null}
        </Field>

        <Field error={form.formState.errors.confirmPassword?.message}>
          <Label htmlFor="confirmPassword">Yeni Şifre (Tekrar)</Label>
          <PasswordInput
            id="confirmPassword"
            autoComplete="new-password"
            show={show.confirm}
            onToggleShow={() => setShow((s) => ({ ...s, confirm: !s.confirm }))}
            hasError={!!form.formState.errors.confirmPassword}
            register={form.register("confirmPassword")}
          />
        </Field>

        <div className="flex items-center justify-between gap-3 pt-2">
          <p className="flex items-center gap-1.5 text-xs text-slate-500">
            <ShieldCheck className="h-3.5 w-3.5 text-success-600" />
            Şifreniz şifrelenmiş olarak saklanır.
          </p>
          <Button
            type="submit"
            variant="primary"
            size="sm"
            loading={changeMutation.isPending}
            disabled={changeMutation.isPending}
          >
            Şifreyi Değiştir
          </Button>
        </div>
      </form>
    </section>
  );
}

interface PasswordInputProps {
  id: string;
  autoComplete: string;
  show: boolean;
  onToggleShow: () => void;
  hasError: boolean;
  register: ReturnType<ReturnType<typeof useForm<FormValues>>["register"]>;
}

function PasswordInput({
  id,
  autoComplete,
  show,
  onToggleShow,
  hasError,
  register,
}: PasswordInputProps) {
  return (
    <div className="relative">
      <Input
        id={id}
        type={show ? "text" : "password"}
        autoComplete={autoComplete}
        hasError={hasError}
        className="pr-10"
        {...register}
      />
      <IconButton
        onClick={onToggleShow}
        tabIndex={-1}
        aria-label={show ? "Şifreyi gizle" : "Şifreyi göster"}
        className="absolute right-2 top-1/2 z-10 -translate-y-1/2"
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </IconButton>
    </div>
  );
}
