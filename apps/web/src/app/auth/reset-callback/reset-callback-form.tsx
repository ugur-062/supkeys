"use client";

import { Button } from "@/components/ui/button";
import { Field } from "@/components/ui/field";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { getSupabaseBrowser } from "@/lib/supabase-browser";
import { zodResolver } from "@hookform/resolvers/zod";
import { Eye, EyeOff } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { useForm } from "react-hook-form";
import { toast } from "sonner";
import { z } from "zod";

/**
 * Supabase password recovery callback.
 *
 * Akış:
 *  1. Kullanıcı e-postadaki "şifre sıfırla" linkine tıklar.
 *  2. Supabase access_token + refresh_token'ı URL hash'ine koyup buraya
 *     yönlendirir: #access_token=...&refresh_token=...&type=recovery
 *  3. Burada hash'i parse edip Supabase session'ı kurarız.
 *  4. Kullanıcı yeni şifreyi girer → supabase.auth.updateUser({password})
 *     auth.users'ı günceller.
 *  5. Domain login flow'u (bizim API) bu yeni şifre ile çalışır.
 *
 * NOT: Backend'e ekstra endpoint yok — Supabase'in `updateUser` API'si
 * recovery token'lı session ile yetkili. RLS bypass söz konusu değil
 * çünkü sadece kullanıcının kendi auth.user satırını güncelleyebilir.
 */

const passwordSchema = z
  .object({
    password: z
      .string()
      .min(8, "Şifre en az 8 karakter olmalı")
      .max(72, "Şifre en fazla 72 karakter olabilir"),
    confirm: z.string(),
  })
  .refine((d) => d.password === d.confirm, {
    message: "Şifreler eşleşmiyor",
    path: ["confirm"],
  });

type Values = z.infer<typeof passwordSchema>;

type Status =
  | { kind: "loading" }
  | { kind: "invalid"; message: string }
  | { kind: "ready" };

export function ResetCallbackForm() {
  const router = useRouter();
  const [status, setStatus] = useState<Status>({ kind: "loading" });
  const [showPassword, setShowPassword] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const {
    register,
    handleSubmit,
    formState: { errors },
  } = useForm<Values>({ resolver: zodResolver(passwordSchema) });

  useEffect(() => {
    let mounted = true;
    (async () => {
      const hash = window.location.hash.replace(/^#/, "");
      const params = new URLSearchParams(hash);
      const accessToken = params.get("access_token");
      const refreshToken = params.get("refresh_token");
      const type = params.get("type");
      const errorDesc = params.get("error_description");

      if (errorDesc) {
        if (mounted) {
          setStatus({
            kind: "invalid",
            message: decodeURIComponent(errorDesc.replace(/\+/g, " ")),
          });
        }
        return;
      }
      if (!accessToken || !refreshToken || type !== "recovery") {
        if (mounted) {
          setStatus({
            kind: "invalid",
            message: "Geçersiz veya süresi geçmiş şifre sıfırlama linki",
          });
        }
        return;
      }

      try {
        const supabase = getSupabaseBrowser();
        const { error } = await supabase.auth.setSession({
          access_token: accessToken,
          refresh_token: refreshToken,
        });
        if (error) {
          if (mounted) {
            setStatus({ kind: "invalid", message: error.message });
          }
          return;
        }
        // URL hash'ini temizle — token tarayıcı geçmişinde kalmasın
        window.history.replaceState(
          null,
          "",
          window.location.pathname + window.location.search,
        );
        if (mounted) setStatus({ kind: "ready" });
      } catch (err) {
        if (mounted) {
          setStatus({
            kind: "invalid",
            message:
              err instanceof Error
                ? err.message
                : "Bağlantı kurulamadı, lütfen yeniden deneyin",
          });
        }
      }
    })();
    return () => {
      mounted = false;
    };
  }, []);

  const onSubmit = async (values: Values) => {
    setSubmitting(true);
    try {
      const supabase = getSupabaseBrowser();
      const { error } = await supabase.auth.updateUser({
        password: values.password,
      });
      if (error) {
        toast.error(error.message);
        return;
      }
      // Recovery session'ı kapat (kullanıcı bizim domain login'e gidecek)
      await supabase.auth.signOut();
      toast.success("Şifren güncellendi — şimdi giriş yapabilirsin.");
      router.push("/login");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Şifre güncellenemedi",
      );
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="max-w-md mx-auto py-12 px-4">
      <h1 className="text-2xl font-bold text-brand-900 mb-2">
        Yeni Şifre Belirle
      </h1>
      <p className="text-sm text-slate-500 mb-6">
        Hesabını aktive etmek için yeni bir şifre seç.
      </p>

      {status.kind === "loading" ? (
        <p className="text-sm text-slate-500">Doğrulanıyor…</p>
      ) : status.kind === "invalid" ? (
        <div className="space-y-4">
          <p className="text-sm text-danger-700 bg-danger-50 border border-danger-200 rounded-lg p-3">
            {status.message}
          </p>
          <Button
            variant="secondary"
            fullWidth
            onClick={() => router.push("/login")}
          >
            Giriş sayfasına dön
          </Button>
        </div>
      ) : (
        <form
          onSubmit={handleSubmit(onSubmit)}
          className="card p-6 md:p-8 space-y-5"
          noValidate
        >
          <Field
            error={errors.password?.message}
            hint="En az 8 karakter"
          >
            <div className="flex items-center justify-between mb-1.5">
              <Label htmlFor="password" required className="mb-0">
                Yeni Şifre
              </Label>
              <button
                type="button"
                onClick={() => setShowPassword((s) => !s)}
                className="text-xs text-brand-600 hover:text-brand-800 inline-flex items-center gap-1"
              >
                {showPassword ? (
                  <>
                    <EyeOff className="w-3 h-3" /> Gizle
                  </>
                ) : (
                  <>
                    <Eye className="w-3 h-3" /> Göster
                  </>
                )}
              </button>
            </div>
            <Input
              id="password"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              hasError={!!errors.password}
              {...register("password")}
            />
          </Field>

          <Field error={errors.confirm?.message}>
            <Label htmlFor="confirm" required>
              Şifre (Tekrar)
            </Label>
            <Input
              id="confirm"
              type={showPassword ? "text" : "password"}
              autoComplete="new-password"
              hasError={!!errors.confirm}
              {...register("confirm")}
            />
          </Field>

          <Button type="submit" fullWidth loading={submitting}>
            Şifreyi Güncelle
          </Button>
        </form>
      )}
    </div>
  );
}
