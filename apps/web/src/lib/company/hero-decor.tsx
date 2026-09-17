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
  { icon: ShieldCheck, avatars: ["/categories/39000000.webp", "/categories/23000000.webp", "/categories/24000000.webp"], title: "Doğrulanmış tedarikçiler", hint: "Belgeleri incelenmiş firmalar", at: "tl" },
  { icon: Sparkles, title: "AI ile tedarikçi bul", hint: "Kalemlerinizden öneri alın", at: "bl" },
];

/* Sağ üst: kullanıcının hazır kart görseli ("Daha büyük fırsatlar"). */
export const BUYER_OBJECTS: HeroObject[] = [
  { src: "/hero/firsatlar.webp", at: "tr" },
  { src: "/hero/kutu.webp", at: "br" },
];

export const SELLER_WIDGETS: HeroWidget[] = [
  { icon: FileSearch, avatars: ["/categories/24000000.webp", "/categories/31000000.webp", "/categories/39000000.webp"], title: "Açık talepler", hint: "Kategorinize uyan alım talepleri", at: "tl" },
  { icon: Store, title: "Ücretsiz vitrin", hint: "Ürünleriniz alıcıların önünde", at: "tr" },
  { icon: BadgeCheck, title: "Doğrulanmış rozeti", hint: "Doğrulama ücretsiz", at: "bl" },
];

export const SELLER_OBJECTS: HeroObject[] = [{ src: "/hero/kutu.webp", at: "br" }];
