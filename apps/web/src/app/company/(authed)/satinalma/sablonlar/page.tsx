"use client";

import { HubList } from "@/components/company/hub-list";
import { FileStack, ListChecks, Users } from "lucide-react";

export default function SatinalmaSablonlarPage() {
  return (
    <HubList
      title="Şablonlar"
      description="İhale açarken tekrar tekrar girdiğiniz verileri bir kez şablonlayın, hızla uygulayın."
      items={[
        {
          href: "/company/satinalma/sablonlar/ihale",
          label: "İhale Şablonları",
          description:
            "Tekrarlayan alımlarınızı (kalemler + ayarlar dahil) şablonlayın; yeni ihaleyi tek tıkla şablondan başlatın.",
          icon: FileStack,
        },
        {
          href: "/company/satinalma/sablonlar/soru-setleri",
          label: "Soru Setleri",
          description:
            "Sık sorduğunuz kalem sorularını sete kaydedin; ihale sihirbazında tek tıkla uygulayın.",
          icon: ListChecks,
        },
        {
          href: "/company/satinalma/sablonlar/gruplar",
          label: "Tedarikçi Grupları",
          description:
            "Birlikte davet ettiğiniz tedarikçi gruplarını şablonlayın; ihale açarken zaman kazanın.",
          icon: Users,
        },
      ]}
    />
  );
}
