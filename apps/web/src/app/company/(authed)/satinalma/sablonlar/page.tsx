"use client";

import { HubList } from "@/components/company/hub-list";
import { FileStack, ListChecks, PackageSearch, Users } from "lucide-react";

export default function SatinalmaSablonlarPage() {
  return (
    <HubList
      title="Şablonlar"
      description="Satın Alma Talebi açarken tekrar tekrar girdiğiniz verileri bir kez şablonlayın, hızla uygulayın."
      items={[
        {
          // Faz 2 — Kalem Kataloğu. Sol menü sadeleştirme kararına sadık
          // kalındı: yeni bir menü satırı AÇILMADI, mevcut Şablonlar hub'ının
          // dördüncü kartı olarak duruyor.
          href: "/company/satinalma/sablonlar/kalemler",
          label: "Kalem Kataloğu",
          description:
            "Sık kullandığınız kalemleri bir kez kaydedin; satın alma talebi açarken “Katalogdan Ekle” ile saniyede listeleyin.",
          icon: PackageSearch,
        },
        {
          href: "/company/satinalma/sablonlar/ihale",
          label: "Satın Alma Talebi Şablonları",
          description:
            "Tekrarlayan alışlarınızı (kalemler + ayarlar dahil) şablonlayın; yeni satın alma talebini tek tıkla şablondan başlatın.",
          icon: FileStack,
        },
        {
          href: "/company/satinalma/sablonlar/soru-setleri",
          label: "Soru Setleri",
          description:
            "Sık sorduğunuz kalem sorularını sete kaydedin; satın alma talebi sihirbazında tek tıkla uygulayın.",
          icon: ListChecks,
        },
        {
          href: "/company/satinalma/sablonlar/gruplar",
          label: "Tedarikçi Grupları",
          description:
            "Birlikte davet ettiğiniz tedarikçi gruplarını şablonlayın; satın alma talebi açarken zaman kazanın.",
          icon: Users,
        },
      ]}
    />
  );
}
