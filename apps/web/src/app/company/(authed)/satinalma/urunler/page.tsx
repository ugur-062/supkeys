"use client";

import { DiscoverProductsView } from "@/components/company/discover-products-view";

/**
 * ÜRÜNLER (satınalma) — başka firmaların vitrinlerindeki ürünler.
 *
 * `satis/urunlerim` ile karıştırılmamalı: orası firmanın KENDİ kataloğu,
 * burası keşif. Aynı sözcüğün iki portalda farklı anlamı olması, iyelik
 * kipinin zorunlu sonucu ("Ürünlerim" vs "Ürünler").
 */
export default function UrunlerPage() {
  return <DiscoverProductsView />;
}
