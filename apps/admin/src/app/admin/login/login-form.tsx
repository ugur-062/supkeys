"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAdminLogin } from "@/hooks/use-admin-auth";
import { zodResolver } from "@hookform/resolvers/zod";
import axios from "axios";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

const loginSchema = z.object({
  email: z.string().email("Geçerli bir e-posta giriniz"),
  password: z.string().min(1, "Şifre gerekli"),
});

type LoginValues = z.infer<typeof loginSchema>;

export function AdminLoginForm() {
  const [showPassword, setShowPassword] = useState(false);
  const router = useRouter();
  const login = useAdminLogin();

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<LoginValues>({
    resolver: zodResolver(loginSchema),
  });

  const onSubmit = (values: LoginValues) => {
    login.mutate(values, {
      onSuccess: (data) => {
        toast.success(`Hoş geldin, ${data.admin.firstName}!`);
        router.push("/admin/dashboard");
      },
      onError: (err) => {
        if (axios.isAxiosError(err)) {
          const msg =
            (err.response?.data as { message?: string } | undefined)?.message ??
            "Giriş başarısız";
          toast.error(msg);
        } else {
          toast.error("Bir sorun oluştu");
        }
      },
    });
  };

  return (
    <form
      onSubmit={handleSubmit(onSubmit)}
      className="admin-card p-6 md:p-8 space-y-5"
      noValidate
    >
      <Field error={errors.email?.message}>
        <Label htmlFor="email" required>
          E-posta
        </Label>
        <Input
          id="email"
          type="email"
          placeholder="admin@supkeys.com"
          autoComplete="email"
          autoFocus
          hasError={!!errors.email}
          {...register("email")}
        />
      </Field>

      <Field error={errors.password?.message}>
        <Label htmlFor="password" required>
          Şifre
        </Label>
        <div className="relative">
          <Input
            id="password"
            type={showPassword ? "text" : "password"}
            placeholder="••••••••"
            autoComplete="current-password"
            hasError={!!errors.password}
            className="pr-10"
            {...register("password")}
          />
          <button
            type="button"
            onClick={() => setShowPassword((v) => !v)}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600"
            tabIndex={-1}
            aria-label={showPassword ? "Şifreyi gizle" : "Şifreyi göster"}
          >
            {showPassword ? (
              <EyeOff className="w-4 h-4" />
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        </div>
      </Field>

      <div className="pt-1">
        <Button type="submit" loading={login.isPending} fullWidth size="lg">
          {login.isPending ? "Giriş yapılıyor..." : "Giriş Yap"}
        </Button>
      </div>

      <p className="text-xs text-admin-text-muted text-center pt-2 border-t border-admin-border">
        Bu sayfa yalnızca Supkeys platform ekibi içindir.
      </p>
    </form>
  );
}
