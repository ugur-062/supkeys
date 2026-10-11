import type { HeroObject, HeroWidget } from "@/components/dashboard/panel-hero-search";
import { BadgeCheck, FileSearch, ShieldCheck, Sparkles, Store } from "lucide-react";

/**
 * HERO DEKORU — TEK KAYNAK (2026-09-18, kullanıcı: "satınalma ve satıştaki
 * arama kısmına yaptıklarımızı anasayfaya da uygula"). Panel anasayfaları ve
 * herkese açık anasayfanın iki yüzü AYNI kartları/nesneleri çizer.
 * Dekoratif: sayı/istatistik yok; fotoğraf yığını yalnız CC0 kategori
 * fotoğrafları; nesneler kullanıcı varlığı (`public/hero/*.webp`).
 */
export const BUYER_WIDGETS: HeroWidget[] = [
  { icon: ShieldCheck, avatars: ["/categories/39000000.webp", "/categories/23000000.webp", "/categories/24000000.webp"], title: "buyer.verified.title", hint: "buyer.verified.hint", at: "tl" },
  { icon: Sparkles, title: "buyer.ai.title", hint: "buyer.ai.hint", at: "bl" },
];

/* `title`/`hint` KATALOG ANAHTARI (`web.marketing.heroDecor.*`); `HeroDecor` çevirir (i18n). Sağ üst: kullanıcının hazır kart görseli ("Daha büyük fırsatlar"). */
export const BUYER_OBJECTS: HeroObject[] = [
  { src: "/hero/firsatlar.webp", at: "tr" },
  { src: "/hero/kutu.webp", at: "br" },
];

export const SELLER_WIDGETS: HeroWidget[] = [
  { icon: FileSearch, avatars: ["/categories/24000000.webp", "/categories/31000000.webp", "/categories/39000000.webp"], title: "seller.open.title", hint: "seller.open.hint", at: "tl" },
  { icon: Store, title: "seller.showcase.title", hint: "seller.showcase.hint", at: "tr" },
  { icon: BadgeCheck, title: "seller.badge.title", hint: "seller.badge.hint", at: "bl" },
];

export const SELLER_OBJECTS: HeroObject[] = [{ src: "/hero/kutu.webp", at: "br" }];
