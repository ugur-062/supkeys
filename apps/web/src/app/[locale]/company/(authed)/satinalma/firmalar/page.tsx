"use client";

import { PanelCompanyIndex } from "@/components/company/market/panel-company-index";

/**
 * FİRMA DİZİNİ — pazar bölgesinin firma tarafı.
 *
 * Aynı sorgu iki sekmede iki sayı verir (Ürünler | Firmalar): alıcı bazen
 * ürünü değil ÜRETİCİYİ arar. Liste eskiden Bağlantılar › Keşfet içindeydi
 * ve orada süzgeçler URL'ye yazılmıyordu; Bağlantılar artık YALNIZ ilişki
 * yönetimi (bağlantılarım, gelen istekler, davet).
 */
export default function PanelCompaniesPage() {
  return <PanelCompanyIndex />;
}
