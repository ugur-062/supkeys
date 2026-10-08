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
 *
 * Catalyst `Input` `className`'i SARMALAYICI span'e verir: `pr-10` oraya
 * yazılınca dolgu kutunun dışında kalıyor, göz tuşu girişin yanında ayrı bir
 * kutucukta görünüyordu (arayüz testi D-352). Dolgu iç `<input>`a gider.
 *
 * Arayüz testi 2026-10 (login-5/10, signup-enru-9, signup-tr-13):
 *  · Kök `data-slot="control"` taşır. Catalyst `<Field>` etiketle denetim
 *    arasındaki 12 px boşluğu yalnız etiketin hemen ardındaki
 *    `data-slot="control"` öğesine koyar; kök onu taşımadığı için "Şifre"
 *    etiketi kutusuna yapışık (4 px), "E-posta" etiketi 16 px yukarıdaydı.
 *    Hata iletisi de (`ErrorMessage`) aynı kuralla standart boşluğu alır.
 *  · Etiket ve hata bağı Headless'tan gelir: iç `Input` `<Field>` bağlamından
 *    id / `aria-labelledby` / `aria-describedby` alır, `invalid` →
 *    `aria-invalid`. Hata `<Field>` içinde `ErrorMessage` olarak çizilmeli.
 *  · Göz tuşu dokunma alanı 32×32 px (eskiden 20×20): simge aynı, dolgu büyüdü.
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
    <div data-slot="control" className="relative">
      <Input
        ref={ref}
        type={gorunur ? "text" : "password"}
        /* Sağda tuş var — metin altına girmesin. */
        className={cn("[&_input]:pr-10", className)}
        {...props}
      />
      <button
        type="button"
        /* Etiket DURUMA göre değişir: ekran okuyucu bir sonraki eylemi okur. */
        aria-label={gorunur ? t("sifreyiGizle") : t("sifreyiGoster")}
        onClick={() => setGorunur((v) => !v)}
        className="absolute top-1/2 right-1 -translate-y-1/2 rounded-md p-2 text-zinc-500 transition-colors hover:text-zinc-900 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-zinc-900"
      >
        <Ikon className="h-4 w-4" aria-hidden />
      </button>
    </div>
  );
});
