"use client";

import { useTranslations } from "next-intl";
import { useParams } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft } from "lucide-react";
import { ArrowTopRightOnSquareIcon } from "@heroicons/react/20/solid";
import { PageContainer } from "@/components/list/page-container";
import { ErrorState } from "@/components/ui/error-state";
import { ProductBreadcrumb, ProductDetailBody } from "@/components/marketplace/product-detail";
import { BuyingGateNotice } from "@/components/marketplace/member-cta";
import { useCompanyAuth } from "@/hooks/use-company-auth";
import { usePublicProduct } from "@/hooks/use-portal-discovery";
import { useScrollToHash } from "@/hooks/use-scroll-to-hash";
import { Link, useRouter } from "@/i18n/navigation";
import { panelProductPath } from "@/lib/company/panel-market";
import { safeExternalUrl } from "@/lib/safe-url";
import { userHasPermission } from "@/lib/company/permissions";
import { buyingGate } from "@/lib/public/member-gate";

/**
 * ÜYENİN ÜRÜN SAYFASI — paket bilmeyen TEK iniş adresi (arayüz testi Y-03,
 * kullanıcı kararları T-02 ve T-18, 2026-10-01).
 *
 * Herkese açık ürün sayfasının giriş/kayıt dönüşü ve panel firma sayfasının
 * ürün kartları buraya gelir. Eskiden hepsi doğrudan satınalma ürün sayfasına
 * (`/company/satinalma/urunler/…`) gidiyordu; satınalma bölümü Gold kapısının
 * arkasında olduğu için ücretsiz/Silver üye ürünü değil "Bu sayfa Gold
 * paketiyle açılır" duvarını görüyordu (yeni kaydolan firma da öyle).
 *
 * Karar:
 *  · Gold ∧ satınalma görüntüleme → satınalma ürün sayfasına geçer (çapa korunur).
 *  · satınalma görüntüleme var ama Gold değil (ücretsiz/Silver Kurucusu vb.) →
 *    ürün panel kabuğunda gösterilir (fiyat, belge indirme — üye — ve video),
 *    "Bilgi iste" yerine Gold uyarısı: doğrulanmamışa önce ücretsiz doğrulama,
 *    değilse Gold'a geçiş.
 *  · satınalma görüntüleme yok → gereken yetki notu + ürünün herkese açık sayfası.
 */
export default function MemberProductPage() {
  const t = useTranslations("web.marketplace.memberGate");
  const tp = useTranslations("web.marketplace.product");
  const params = useParams<{ firmaSlug: string; urunSlug: string }>();
  const firmaSlug = params?.firmaSlug ?? "";
  const urunSlug = params?.urunSlug ?? "";
  const router = useRouter();
  const { user, company: own } = useCompanyAuth();

  const browse = buyingGate(user, own, "browse");
  const inquiry = buyingGate(user, own, "inquiry");
  const goldBuyer = browse === "ok";
  // Satınalma görüntüleme izni (paketten bağımsız) — panel ürün ucu bunu ister.
  const canView = userHasPermission(user, "buy:view");

  useEffect(() => {
    if (!goldBuyer) return;
    const hash = typeof window === "undefined" ? "" : window.location.hash;
    router.replace(`${panelProductPath(firmaSlug, urunSlug)}${hash}`);
  }, [goldBuyer, firmaSlug, urunSlug, router]);

  const showProduct = canView && !goldBuyer;
  const { data, isPending, isError, refetch } = usePublicProduct(showProduct ? firmaSlug : "", urunSlug);
  useScrollToHash(showProduct && !!data);

  const publicHref = `/firma/${firmaSlug}/urun/${urunSlug}`;

  // BELGE İNDİRME ÜYEYE (T-18; webA-03 yeniden doğrulama): herkese açık
  // sayfanın "Belgeyi indirmek için giriş yapın" dönüşü `#belgeler` ile buraya
  // gelir. Satınalma görüntüleme izni olmayan üye (satış koltuğu,
  // görüntüleyici) burada ürünü göremez; eskiden "yetki gerekir" notuyla
  // herkese açık sayfaya geri gönderiliyor, orada yine giriş isteniyordu
  // (döngü). Herkese açık sayfa artık oturumlu üyeye indirme bağlantısını
  // kendisi verir → doğrudan oraya, Belgeler sekmesine.
  const noViewDocs = !!user && !goldBuyer && !canView;
  useEffect(() => {
    if (!noViewDocs || typeof window === "undefined" || window.location.hash !== "#belgeler") return;
    router.replace(`${publicHref}#belgeler`);
  }, [noViewDocs, publicHref, router]);

  // `isPending`: çevrimdışı duraklayan sorguda `isLoading` false kalır ve
  // "bulunamadı" çizilirdi. Sorgu yalnız `showProduct` iken açık.
  if (!user || goldBuyer || (showProduct && isPending)) {
    return (
      <PageContainer>
        <p className="text-sm text-zinc-500">{t("loading")}</p>
      </PageContainer>
    );
  }

  if (!showProduct) {
    // Gold değil ve satınalma görüntüleme izni de yok ya da Gold ama izin yok.
    return (
      <PageContainer>
        <div className="mx-auto max-w-md rounded-2xl bg-white px-6 py-8 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm text-zinc-700">{t("noBuyView")}</p>
          <Link href={publicHref} className="mt-4 inline-flex text-sm font-semibold text-blue-700 hover:underline">
            {t("publicProductPage")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  // KESİNTİ ≠ YOK (canlı doğrulama 2026-10-09 taraması): kanca 404'ü `null`
  // döndürür; `isError` = ürün OKUNAMADI — "bulunamadı" denmez. Arka plan
  // yenilemesi düşerse eldeki ürün ekranda kalır.
  if (isError && !data) {
    return (
      <PageContainer>
        <ErrorState onRetry={() => void refetch()} />
      </PageContainer>
    );
  }

  if (!data) {
    return (
      <PageContainer>
        <div className="rounded-2xl bg-white px-6 py-10 text-center ring-1 ring-zinc-950/5">
          <p className="text-sm font-semibold text-zinc-900">{t("notFound")}</p>
          <Link
            href="/company"
            className="mt-4 inline-flex items-center gap-1.5 text-sm font-semibold text-zinc-900 hover:text-zinc-600"
          >
            <ArrowLeft aria-hidden className="size-4" />
            {t("backToPanel")}
          </Link>
        </div>
      </PageContainer>
    );
  }

  const { product, company } = data;
  const companyHref = `/company/firma/${firmaSlug}`;
  const ownProduct = !!own?.slug && company.slug === own.slug;
  // Firmanın web sitesi üyeye açık (görünürlük tablosu `companyWebsite: member`).
  const sellerWebsite = safeExternalUrl(company.website);

  return (
    <PageContainer>
      <ProductBreadcrumb
        home={{ href: "/company" }}
        accent="blue"
        trail={[{ label: company.name, href: companyHref }]}
        current={product.name}
      />
      <ProductDetailBody
        product={product}
        company={company}
        companyHref={companyHref}
        accent="blue"
        sellerSite={
          sellerWebsite ? (
            <a
              href={sellerWebsite}
              target="_blank"
              rel="noopener noreferrer nofollow"
              className="inline-flex items-center gap-1 text-sm font-medium text-zinc-700 hover:text-zinc-950"
            >
              {tp("sellerSite")}
              <ArrowTopRightOnSquareIcon aria-hidden className="size-3.5" />
            </a>
          ) : null
        }
        cta={
          ownProduct ? (
            <p className="rounded-lg bg-zinc-100 px-3 py-2 text-sm text-zinc-600">{t("ownProduct")}</p>
          ) : (
            <BuyingGateNotice gate={inquiry} action="inquiry" />
          )
        }
      />
    </PageContainer>
  );
}
