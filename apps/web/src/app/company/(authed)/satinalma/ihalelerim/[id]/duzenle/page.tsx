"use client";

import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useParams } from "next/navigation";

export default function EditTenderPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isLoading } = useListingDetail(id);

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }
  if (!l || !l.isOwner) {
    return (
      <Notice
        title="İhale bulunamadı"
        desc="Bu ihaleyi düzenleme yetkiniz yok."
        href="/company/satinalma/ihalelerim"
      />
    );
  }
  if (l.type !== "ALIM") {
    return (
      <Notice
        title="Bu ekran yalnızca ihaleleri düzenler"
        desc="Satış ilanları kendi düzenleme ekranından güncellenir."
        href={`/company/ilan/${id}`}
      />
    );
  }
  if (!l.canEdit) {
    return (
      <Notice
        title="Düzenlenemez"
        desc="Bu ihaleye teklif verilmiş veya kapanmış; içerik değiştirilemez."
        href={`/company/ilan/${id}`}
      />
    );
  }

  return (
    <TenderWizard
      mode="edit"
      listingId={id}
      initialValues={mapDetailToForm(l)}
    />
  );
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
  return (
    <div className="mx-auto max-w-2xl space-y-4 py-12 text-center">
      <h1 className="text-lg font-semibold text-zinc-900">{title}</h1>
      <Text className="text-sm text-zinc-500">{desc}</Text>
      <Button href={href} outline>
        Geri Dön
      </Button>
    </div>
  );
}
