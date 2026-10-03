"use client";

import { useTranslations } from "next-intl";
import { HubList } from "@/components/company/hub-list";
import { FileStack, ListChecks, PackageSearch, SlidersHorizontal, Users } from "lucide-react";

export default function SatinalmaSablonlarPage() {
  const t = useTranslations("web.panel.requests.page");
  return (
    <HubList
      title={t("sablonlar")}
      description={t("satinAlmaTalebiAcarkenTekrar")}
      items={[
        {
          // Talep şartları (2026-09-09, hızlı talep): ticari profil — teslim,
          // ödeme, para birimi, görünürlük, süre. Bir kez kurulur.
          href: "/company/satinalma/sablonlar/talep-sartlari",
          label: t("talepSartlari"),
          description:
            t("teslimSekliOdemeKosuluPara2"),
          icon: SlidersHorizontal,
        },
        {
          // Faz 2 — Kalem Kataloğu. Sol menü sadeleştirme kararına sadık
          // kalındı: yeni bir menü satırı AÇILMADI, mevcut Şablonlar hub'ının
          // dördüncü kartı olarak duruyor.
          href: "/company/satinalma/sablonlar/kalemler",
          label: t("kalemKatalogu"),
          description:
            t("sikKullandiginizKalemleriBirKez"),
          icon: PackageSearch,
        },
        {
          href: "/company/satinalma/sablonlar/talep",
          label: t("satinAlmaTalebiSablonlari"),
          description:
            t("tekrarlayanAlislariniziKalemlerAyarlarDahil"),
          icon: FileStack,
        },
        {
          href: "/company/satinalma/sablonlar/soru-setleri",
          label: t("soruSetleri"),
          description:
            t("sikSordugunuzKalemSorulariniSete"),
          icon: ListChecks,
        },
        {
          href: "/company/satinalma/sablonlar/gruplar",
          label: t("tedarikciGruplari"),
          description:
            t("birlikteDavetEttiginizTedarikciGruplarini"),
          icon: Users,
        },
      ]}
    />
  );
}
