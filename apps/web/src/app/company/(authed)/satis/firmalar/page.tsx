"use client";

import { PanelCompanyIndex } from "@/components/company/market/panel-company-index";

/**
 * FİRMA DİZİNİ — satış tarafı (2026-09-10, kullanıcı isteği).
 *
 * Satınalma paneli tedarikçi arar; satış paneli de "kime satabilirim"i
 * aramalı. Aynı dizin bileşeni, aynı uç (`company/directory` sell:view'a
 * açık) — yalnız adresler ve dil satış portalına ait. Bağlantılar › Keşfet
 * "Tüm firmaları ara" buradan; satınalmaya erişimi olmayan kullanıcı
 * satınalma dizinine düşmez.
 */
export default function SellerCompaniesPage() {
  return <PanelCompanyIndex portal="satis" />;
}
