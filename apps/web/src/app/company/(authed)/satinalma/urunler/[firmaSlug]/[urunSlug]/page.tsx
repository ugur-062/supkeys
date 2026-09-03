"use client";

import { PageContainer } from "@/components/list/page-container";
import {
  ProductBreadcrumb,
  ProductDetailBody,
} from "@/components/marketplace/product-detail";
import { usePublicProduct } from "@/hooks/use-portal-discovery";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";

/**
 * PANEL içi ürün sayfası — `Ürün Ara`dan açılan kartın hedefi.
 *
 * Neden var: kart eskiden doğrudan `/firma/<slug>/urun/<slug>` adresine, yani
 * herkese açık pazar yeri sayfasına gidiyordu. O layout oturumu HİÇ okumaz
 * (oturum httpOnly çerezde ve public sayfa `/me` çağırmaz), dolayısıyla giriş
 * yapmış kullanıcı sol menüyü kaybediyor, üstte "Giriş Yap / Kaydol" görüyor
 * ve teklif kutusunda kendi kimlik bilgilerini yeniden yazması isteniyordu.
 *
 * İçerik KOPYALANMADI: gövde (`ProductDetailBody`) public sayfayla ortak; bu
 * sayfa yalnız kabuğu (panel) ve eylemi (CTA) değiştirir.
 */
export default function PanelProductPage() {
  const params = useParams<{ firmaSlug: string; urunSlug: string }>();
  const firmaSlug = params?.firmaSlug ?? "";
  const urunSlug = params?.urunSlug ?? "";
  const { data, isLoading, isError } = usePublicProduct(firmaSlug, urunSlug);

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-zinc-500">Yükleniyor…</p>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <div className="rounded-2xl bg-zinc-50 px-6 py-10 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-900">Ürün bulunamadı.</p>
          <p className="mt-1 text-sm text-zinc-500">
            Ürün vitrinden çekilmiş ya da firmanın profili yayında olmayabilir.
          </p>
          <Link
            href="/company/satinalma/urunler"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            <ArrowLeft aria-hidden className="size-4" />
            Ürün Ara&apos;ya dön
          </Link>
        </div>
      </PageContainer>
    );
  }

  const { product, company } = data;
  // Firma sayfası panelin KENDİ dizin sayfasıdır (bağlantı kur / mesaj gönder
  // eylemleri orada). Uç artık slug'ı da çözüyor, rothernId aramaya gerek yok.
  const companyHref = `/company/firma/${firmaSlug}`;

  return (
    <PageContainer>
      <ProductBreadcrumb
        trail={[
          { label: "Ürün Ara", href: "/company/satinalma/urunler" },
          { label: company.name, href: companyHref },
        ]}
        current={product.name}
      />

      <ProductDetailBody
        product={product}
        company={company}
        companyHref={companyHref}
        cta={
          <>
            {/* Kimlik SORULMAZ — kullanıcı zaten giriş yapmış. Misafir
                "Teklif iste" formu (ad/e-posta/firma/telefon) burada yanlış
                olurdu; ayrıca o uç `MARKETPLACE_LIVE` kapalıyken 404 döner.
                Bağlantı/mesaj eylemleri firma sayfasında toplu duruyor. */}
            <Link
              href={companyHref}
              className="flex w-full items-center justify-center rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Firmayla iletişime geç
            </Link>
            <p className="mt-2 text-center text-xs text-zinc-500">
              Firma sayfasından bağlantı daveti gönderebilir ya da mesaj
              yazabilirsiniz.
            </p>
          </>
        }
      />
    </PageContainer>
  );
}
