"use client";

import { PageContainer } from "@/components/list/page-container";
import {
  ProductBreadcrumb,
  ProductDetailBody,
  RelatedRows,
} from "@/components/marketplace/product-detail";
import { PanelInquiryDialog } from "@/components/inquiries/panel-inquiry-dialog";
import { useRelatedProducts, usePublicProduct } from "@/hooks/use-portal-discovery";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useState } from "react";

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
  const [inquiryOpen, setInquiryOpen] = useState(false);
  const firmaSlug = params?.firmaSlug ?? "";
  const urunSlug = params?.urunSlug ?? "";
  const { data, isLoading, isError } = usePublicProduct(firmaSlug, urunSlug);
  const related = useRelatedProducts(firmaSlug, urunSlug);

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
          ...(product.category
            ? [{ label: product.category.name, href: `/company/satinalma/urunler?kategori=${product.category.id}` }]
            : []),
          { label: company.name, href: companyHref },
        ]}
        current={product.name}
      />

      <ProductDetailBody
        product={product}
        company={company}
        companyHref={companyHref}
        sellerSite={
          company.website ? (
            <a
              href={company.website}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-950"
            >
              Firmanın web sitesi
              <ArrowTopRightOnSquareIcon aria-hidden className="size-3.5" />
            </a>
          ) : null
        }
        cta={
          <>
            {/* Kimlik SORULMAZ — kullanıcı zaten giriş yapmış. Misafir
                "Teklif iste" formu (ad/e-posta/firma/telefon) burada yanlış
                olurdu; ayrıca o uç `MARKETPLACE_LIVE` kapalıyken 404 döner. */}
            <button
              type="button"
              onClick={() => setInquiryOpen(true)}
              className="w-full rounded-lg bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Bilgi / teklif iste
            </button>
            <Link
              href={companyHref}
              className="mt-2 block w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-center text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
            >
              Firma sayfası
            </Link>
          </>
        }
      />

      <PanelInquiryDialog
        open={inquiryOpen}
        onClose={() => setInquiryOpen(false)}
        companySlug={firmaSlug}
        productSlug={urunSlug}
        productName={product.name}
        companyName={company.name}
        sellerFreeMember={company.freeMember === true}
        seed={{
          productName: product.name,
          unit: product.unit,
          categoryId: product.categoryId,
          keywords: product.keywords,
          companyName: company.name,
        }}
      />
      {related.data ? (
        <RelatedRows
          related={related.data}
          categoryName={product.category?.name ?? null}
          companyHref={companyHref}
          hrefFor={(c) => `/company/satinalma/urunler/${c.company.slug}/${c.slug}`}
        />
      ) : null}
    </PageContainer>
  );
}
