"use client";

import { useTranslations } from "next-intl";
import { PageContainer } from "@/components/list/page-container";
import {
  ProductBreadcrumb,
  ProductDetailBody,
  RelatedRows,
} from "@/components/marketplace/product-detail";
import { PanelInquiryDialog } from "@/components/inquiries/panel-inquiry-dialog";
import { RfqBanner } from "@/components/marketplace/rfq-banner";
import { useRelatedProducts, usePublicProduct } from "@/hooks/use-portal-discovery";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useScrollToHash } from "@/hooks/use-scroll-to-hash";
import { visibleCategoryRef } from "@/lib/visible-categories";
import { safeExternalUrl } from "@/lib/safe-url";
import { ArrowTopRightOnSquareIcon, DocumentTextIcon } from "@heroicons/react/20/solid";
import { ArrowLeft } from "lucide-react";
import { Link } from "@/i18n/navigation";
import { panelCategoryPath } from "@/lib/company/panel-market";
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
  const t = useTranslations("web.panel.market.firmaslugUrunSlugPage");
  const tg = useTranslations("web.marketplace.memberGate");
  const params = useParams<{ firmaSlug: string; urunSlug: string }>();
  const [inquiryOpen, setInquiryOpen] = useState(false);
  // POST /company/inquiries `buy:inquiry:send` ister (yalnız Satın Almacı
  // koltuğu). buy:view ile giren Yönetici/görüntüleyici formu doldurup 403
  // almasın: düğme yerine gereken yetkiyi söyleyen not (derin denetim LU-22).
  const canInquire = useHasCompanyPermission("buy:inquiry:send");
  // Talep açma bandı yalnız yetkiliye (arayüz testi O-079).
  const canOpenRequest = useHasCompanyPermission("buy:listing:manage");
  const { company: own } = useCompanyAuth();
  const firmaSlug = params?.firmaSlug ?? "";
  const urunSlug = params?.urunSlug ?? "";
  const { data, isLoading, isError } = usePublicProduct(firmaSlug, urunSlug);
  const related = useRelatedProducts(firmaSlug, urunSlug);
  // Veri istemcide gelir; kart/e-posta "Bilgi iste"si `#bilgi-iste` çapasıyla
  // açılır ama tarayıcı öğeyi ilk boyamada bulamıyordu (arayüz testi D-022).
  useScrollToHash(!!data);

  if (isLoading) {
    return (
      <PageContainer>
        <p className="text-sm text-zinc-500">{t("yukleniyor")}</p>
      </PageContainer>
    );
  }

  if (isError || !data) {
    return (
      <PageContainer>
        <div className="rounded-2xl bg-zinc-50 px-6 py-10 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-900">{t("urunBulunamadi")}</p>
          <p className="mt-1 text-sm text-zinc-500">
            {t("urunVitrindenCekilmisYaDa")}
          </p>
          <Link
            href="/company/satinalma/urunler"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("urunAraYaDon")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  const { product, company } = data;
  // Kendi firmanın ürünü: API bilgi talebini 400 ile reddeder — düğme yerine
  // not (arayüz testi D-230).
  const ownProduct = !!own?.slug && company.slug === own.slug;
  // Firma sayfası panelin KENDİ dizin sayfasıdır (bağlantı kur / mesaj gönder
  // eylemleri orada). Uç artık slug'ı da çözüyor, rothernId aramaya gerek yok.
  const companyHref = `/company/firma/${firmaSlug}`;
  // Web sitesi ham kaydedilir (admin düzenlemesi yalnız trim'ler): şemasız
  // "www.firma.com" href'te göreli bağlantı olur. Render sınırında normalize
  // edilir; güvensiz/geçersizse bağlantı hiç basılmaz (derin denetim LU-22).
  const sellerWebsite = safeExternalUrl(company.website);
  // Gizli segmentteki (eski veri) kategori: sayfası 404 verir → kırıntı adımı
  // çizilmez (arayüz testi D-023) ve "… kategorisinde yeni" başlığına adı
  // girmez (2026-10-09). Gövdedeki hap aynı kuralı `ProductDetailBody`de uygular.
  const category = visibleCategoryRef(product.category);

  return (
    <PageContainer>
      <ProductBreadcrumb
        home={{ href: "/company/satinalma", label: t("satinalmaAnasayfasi") }}
        accent="blue"
        trail={[
          { label: t("urunAra"), href: "/company/satinalma/urunler" },
          /* Kategori adımı KENDİ SAYFASINA gider (`/kategori/<kod>-<ad>`),
             süzgeçli listeye değil: her kategorinin bir adresi var ve
             paylaşılabilir olan o. */
          ...(category
            ? [{ label: category.name, href: panelCategoryPath(category.id, category.name) }]
            : []),
          { label: company.name, href: companyHref },
        ]}
        current={product.name}
      />

      <ProductDetailBody
        product={product}
        company={company}
        companyHref={companyHref}
        related={related.data}
        hrefFor={(c) => `/company/satinalma/urunler/${c.company.slug}/${c.slug}`}
        accent="blue"
        sellerSite={
          sellerWebsite ? (
            <a
              href={sellerWebsite}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-950"
            >
              {t("firmaninWebSitesi")}
              <ArrowTopRightOnSquareIcon aria-hidden className="size-3.5" />
            </a>
          ) : null
        }
        cta={
          /* TEK EYLEM (2026-09-08, kullanıcı kararı: "firma sayfası yazısını
             kaldır, ürün görüntülenirken gerek yok"). Firmaya giden yol
             kaybolmadı: kırıntıda ve satıcı kartındaki firma adında duruyor —
             kartın altında ikinci bir düğme olarak değil.
             Kimlik SORULMAZ: kullanıcı zaten giriş yapmış; misafir formu
             burada yanlış olurdu (o uç `MARKETPLACE_LIVE` kapalıyken 404). */
          ownProduct ? (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">{tg("ownProduct")}</p>
          ) : canInquire ? (
            <button
              type="button"
              onClick={() => setInquiryOpen(true)}
              className="inline-flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-4 py-3 text-sm font-semibold text-white transition hover:bg-blue-700"
            >
              <DocumentTextIcon aria-hidden className="size-5" />
              {t("bilgiIste")}
            </button>
          ) : (
            <p className="rounded-lg bg-zinc-50 px-3 py-2 text-sm text-zinc-500">
              {t("bilgiIstemekIcinYetki")}
            </p>
          )
        }
      />

      <PanelInquiryDialog
        open={canInquire && !ownProduct && inquiryOpen}
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
          categoryName={category?.name ?? null}
          hrefFor={(c) => `/company/satinalma/urunler/${c.company.slug}/${c.slug}`}
        />
      ) : null}

      {/* TEKLİF TALEBİ BANDI (2026-09-08, kullanıcı referansı): aradığı ürünü
          bulamayan ya da fiyat karşılaştırmak isteyen alıcı için sayfanın
          sonundaki tek çıkış. Panel varyantı doğrudan sihirbaza gider
          (kayıt hunisi değil) ve MAVİ. */}
      {canOpenRequest ? (
        <div className="mt-4">
          <RfqBanner variant="panel" prefill={product.name} />
        </div>
      ) : null}
    </PageContainer>
  );
}
