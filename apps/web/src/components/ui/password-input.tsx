"use client";

import { Input } from "@/components/catalyst/input";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";
import { Eye, EyeOff } from "lucide-react";
import { forwardRef, useState, type ComponentPropsWithoutRef } from "react";

/**
 * ŞİFRE ALANI — göster/gizle tuşlu. TEK KAYNAK.
 *
 * Desen zaten şifre sıfırlama ekranında vardı ama oraya GÖMÜLÜYDÜ; giriş,
 * kayıt ve davet-kabul ekranlarında yoktu. Kullanıcı yazdığı şifreyi
 * göremeyince, özellikle telefonda, hatalı giriş yapıp kilitleniyor.
 * Kopyalamak yerine buraya çıkarıldı: bir daha düzeltilirse hepsi düzelir.
 *
 * Çıkarırken iki kusur giderildi:
 *  · İkon `text-zinc-400` idi → beyaz zeminde 2,62:1. Arayüz bileşenlerinde
 *    sınır 3:1; `zinc-500` (4,83) geçiyor. (CLAUDE.md: küçük metinde
 *    zinc-400 kullanma.)
 *  · `tabIndex={-1}` ile klavyeden ERİŞİLEMİYORDU. Şifreyi görmek bir
 *    işlevdir; klavye kullanıcısından esirgenemez. Tuş artık sekmeyle
 *    geziliyor ve görünür odak halkası taşıyor.
 *
 * `forwardRef`: react-hook-form `register()` ref veriyor, kırılmamalı.
 */
type Props = Omit<ComponentPropsWithoutRef<typeof Input>, "type">;

export const PasswordInput = forwardRef<HTMLInputElement, Props>(function PasswordInput(
  { className, ...props },
  ref,
) {
  const t = useTranslations("web.shared.passwordInput");
  const [gorunur, setGorunur] = useState(false);
  const Ikon = gorunur ? EyeOff : Eye;

  return (
    <div className="relative">
      <Input
        ref={ref}
        type={gorunur ? "text" : "password"}
        /* Sağda tuş var — metin altına girmesin. */
        className={cn("pr-10", className)}
        {...props}
      />
      <button
        type="button"
        /* Etiket DURUMA göre değişir: ekran okuyucu bir sonraki eylemi okur. */
        aria-label={gorunur ? t("sifreyiGizle") : t("sifreyiGoster")}
        onClick={() => setGorunur((v) => !v)}
        className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-0.5 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-zinc-900"
      >
        <Ikon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
});
