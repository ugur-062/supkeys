"use client";

import { HubList } from "@/components/company/hub-list";
import { FileStack, ListChecks, Users } from "lucide-react";

export default function SatisSablonlarPage() {
  return (
    <HubList
      title="Şablonlar"
      description="İlan açarken tekrar tekrar girdiğiniz verileri bir kez şablonlayın, hızla uygulayın."
      items={[
        {
          href: "/company/satis/sablonlar/ihale",
          label: "İlan Şablonları",
          description:
            "Tekrarlayan satışlarınızı (kalemler + ayarlar dahil) şablonlayın; yeni ilanı tek tıkla şablondan başlatın.",
          icon: FileStack,
        },
        {
          href: "/company/satis/sablonlar/soru-setleri",
          label: "Soru Setleri",
          description:
            "Sık sorduğunuz kalem sorularını sete kaydedin; ilan sihirbazında tek tıkla uygulayın.",
          icon: ListChecks,
        },
        {
          href: "/company/satis/sablonlar/gruplar",
          label: "Alıcı Grupları",
          description:
            "Birlikte davet ettiğiniz alıcı gruplarını şablonlayın; ilan açarken zaman kazanın.",
          icon: Users,
        },
      ]}
    />
  );
}
