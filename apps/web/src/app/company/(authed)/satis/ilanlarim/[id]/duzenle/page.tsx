"use client";

import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { TenderWizard } from "@/components/tenders/wizard/tender-wizard";
import { useListingDetail } from "@/hooks/use-company-listings";
import { mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useParams } from "next/navigation";

/** SATIŞ ihalesi düzenleme — teklif gelmeden, satış sihirbazıyla. */
export default function EditSatisIhalesiPage() {
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isLoading } = useListingDetail(id);

  if (isLoading) {
    return <Text className="text-sm text-zinc-500">Yükleniyor…</Text>;
  }
  if (!l || !l.isOwner || l.type !== "SATIS") {
    return (
      <Notice
        title="satış ilanı bulunamadı"
        desc="Bu ilanı düzenleme yetkiniz yok."
        href="/company/satis/ilanlarim"
      />
    );
  }
  if (!l.canEdit) {
    return (
      <Notice
        title="Düzenlenemez"
        desc="Bu ilana teklif verilmiş veya kapanmış; içerik değiştirilemez."
        href={`/company/ilan/${id}`}
      />
    );
  }

  return (
    <TenderWizard mode="edit" listingId={id} initialValues={mapDetailToForm(l)} />
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
