"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { QuickRequest } from "@/components/tenders/quick/quick-request";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useParams } from "next/navigation";

export default function EditTenderPage() {
  const t = useTranslations("web.panel.requests.page");
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isLoading } = useListingDetail(id);

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>;
  }
  if (!l || !l.isOwner) {
    return (
      <Notice
        title={t("satinAlmaTalebiBulunamadi")}
        desc={t("buSatinAlmaTalebiniDuzenleme")}
        href="/company/satinalma/taleplerim"
      />
    );
  }
  if (l.type !== "ALIM") {
    return (
      <Notice
        title={t("buEkranYalnizcaSatinAlma")}
        desc={t("satisIlanlariKendiDuzenlemeEkranindan")}
        href={`/company/ilan/${id}`}
      />
    );
  }
  if (!l.canEdit) {
    return (
      <Notice
        title={t("duzenlenemez")}
        desc={t("buSatinAlmaTalebineTeklif")}
        href={`/company/ilan/${id}`}
      />
    );
  }

  // Düzenleme de HIZLI KARTLA (2026-09-19: detaylı sihirbaz kaldırıldı).
  return <QuickRequest key={id} mode="edit" listingId={id} initialValues={mapDetailToForm(l)} />;
}

function Notice({
  title,
  desc,
  href,
}: {
  title: string;
  desc: string;
  href: string;
}) {
  const t = useTranslations("web.panel.requests.page");
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
      <Text className="text-sm text-zinc-500">{desc}</Text>
      <Button href={href} outline>
        {t("geriDon")}
      </Button>
    </div>
  );
}
