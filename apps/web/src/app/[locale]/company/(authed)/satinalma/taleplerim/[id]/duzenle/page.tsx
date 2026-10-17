"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/components/catalyst/button";
import { Text } from "@/components/catalyst/text";
import { PageContainer } from "@/components/list/page-container";
import { PageHeader } from "@/components/list/page-header";
import { QuickRequest } from "@/components/tenders/quick/quick-request";
import { ErrorState } from "@/components/ui/error-state";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { useListingDetail } from "@/hooks/use-company-listings";
import { canManageListing } from "@/lib/tenders/can-manage-listing";
import { hasRetiredCategory, mapDetailToForm } from "@/lib/tenders/map-detail-to-form";
import { useParams } from "next/navigation";

export default function EditTenderPage() {
  const t = useTranslations("web.panel.requests.page");
  const params = useParams<{ id: string }>();
  const id = params.id;
  const { data: l, isPending, isError, error, refetch } = useListingDetail(id);
  const { user } = useCompanyAuth();

  // `isPending`: çevrimdışı duraklayan sorguda `isLoading` false kalır ve
  // "bulunamadı" çizilirdi (LİSTE DURUMLARI).
  if (isPending) {
    return <Text className="text-sm text-zinc-500">{t("yukleniyor")}</Text>;
  }
  // KESİNTİ ≠ YOK (canlı doğrulama 2026-10-09 taraması): talep OKUNAMADIYSA
  // (yanıt yok / 5xx / 429) "Satın alma talebi bulunamadı" demek yalan olur —
  // eskiden hata dalı yoktu. "Bulunamadı" yalnız API'nin 4xx yanıtında.
  if (!l && isError) {
    const status = (error as { response?: { status?: number } } | null)?.response?.status;
    if (!status || status >= 500 || status === 429) {
      return <ErrorState className="mx-auto max-w-2xl" onRetry={() => void refetch()} />;
    }
  }
  // Olmayan / görülemeyen kayıt "bulunamadı" der; "yetkiniz yok" yalnız
  // görülen ama düzenlenemeyen talepte (arayüz testi D-244).
  if (!l) {
    return <Notice title={t("satinAlmaTalebiBulunamadi")} desc={t("talepBulunamadiAciklama")} href="/company/satinalma/taleplerim" />;
  }
  if (!l.isOwner) {
    return <Notice title={t("duzenlemeYetkinizYok")} desc={t("buSatinAlmaTalebiniDuzenleme")} href="/company/satinalma/taleplerim" />;
  }
  // Yönetim kapısı API ile BİREBİR (D-039): izin VE talebi açan kişi — Sahip
  // istisnası yok. Eskiden form açılıyor, kayıt 403 ile düşüyordu. İzin
  // katman düzeyinde (`layout.tsx` PermissionGate) zaten denetlendi.
  if (!canManageListing({ hasManagePermission: true, createdById: l.createdById, userId: user?.id })) {
    return <Notice title={t("duzenlenemez")} desc={t("yalnizTalebiAcanDuzenleyebilir")} href={`/company/ilan/${id}`} />;
  }
  if (!l.canEdit) {
    return <Notice title={t("duzenlenemez")} desc={t("buSatinAlmaTalebineTeklif")} href={`/company/ilan/${id}`} />;
  }

  // Düzenleme de HIZLI KARTLA (2026-09-19: detaylı sihirbaz kaldırıldı).
  // Durum geçer: teklifsiz OPEN talepte kaydet yayın ucunu çağırmaz (Y-20).
  // Sayfa başlığı + Vazgeç (D-244): talep detayına döner, kayıt yapmaz.
  // `retiredCategory`: eşleyici gizli kategoriyi forma vermez; alanın neden boş
  // olduğunu form buradan öğrenir (gözden geçirme R-WEB-01).
  return (
    <PageContainer>
      <PageHeader
        title={t("talebiDuzenle")}
        description={l.title}
        action={
          <Button href={`/company/ilan/${id}`} outline>
            {t("vazgec")}
          </Button>
        }
      />
      <div className="mt-6">
        <QuickRequest
          key={id}
          mode="edit"
          listingId={id}
          listingStatus={l.status}
          initialValues={mapDetailToForm(l)}
          invitationsAsOf={l.invitationsAsOf}
          retiredCategory={hasRetiredCategory(l)}
        />
      </div>
    </PageContainer>
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
