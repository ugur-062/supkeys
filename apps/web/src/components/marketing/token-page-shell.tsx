"use client";

import { RothernLogo } from "@/components/brand/logo";
import { Link } from "@/i18n/navigation";
import { cn } from "@/lib/utils";
import { useTranslations } from "next-intl";

/**
 * JETONLU TEK İŞLEM SAYFALARININ ÇIKIŞ YOLU (mobil denetim 2026-10 g01) —
 * davet kapatma, e-posta tercihleri, kayıtsız talep önizlemesi.
 *
 * Bu sayfalar pazarlama üst çubuğu taşımaz (tek kartlık işlem sayfası).
 * Telefonda uygulama yüklüyse e-postadaki bağlantı uygulamada açılır
 * (Universal/App Links bütün yolları uygulamaya devreder) ve iOS kabuğunda
 * adres çubuğu da geri düğmesi de yok: hata ya da sonuç kartında kalan
 * kullanıcı uygulamayı kapatmadan çıkamıyordu. Kartın üstünde ana sayfaya
 * bağlı logo her hâlde, hata/sonuç kartının içinde ayrıca açık bir
 * "Ana sayfaya dön" bağlantısı durur.
 */
export function TokenPageLogo({ className }: { className?: string }) {
  return (
    // Dokunma alanı logo + 6 px dolgu (≈ 47 px), görünüm yerinde.
    <Link href="/" className={cn("-m-1.5 inline-flex rounded-lg p-1.5", className)}>
      <RothernLogo variant="full-light" size="sm" priority />
    </Link>
  );
}

/** Hata/sonuç kartının ikincil çıkışı: 44 px yüksek, tam genişlik dokunma alanı. */
export function TokenPageHomeLink({ className }: { className?: string }) {
  const t = useTranslations("web.marketplace.pages");
  return (
    <Link
      href="/"
      className={cn(
        "inline-flex min-h-11 w-full items-center justify-center rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100",
        className,
      )}
    >
      {t("backHome")}
    </Link>
  );
}
