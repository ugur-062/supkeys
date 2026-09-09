"use client";

import { ProductDetailBody } from "@/components/marketplace/product-detail";
import { Badge } from "@/components/catalyst/badge";
import { useCompanyAuth, useHasCompanyPermission } from "@/hooks/use-company-auth";
import { useCompanyProfile } from "@/hooks/use-company-profile";
import { useCategoriesByIds } from "@/hooks/use-categories";
import { usePublishProduct, type CatalogItem, type ProductShowcase } from "@/hooks/use-company-items";
import { PRODUCT_STATUS, productStatusKey } from "@/lib/company/product-status";
import { formatDate } from "@/lib/format-date";
import type { PublicProduct, PublicProductCompany } from "@/lib/public/marketplace-api";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import { useMemo } from "react";
import { toast } from "sonner";

/**
 * ÜRÜN ÖNİZLEME — İNCELEME KİLİDİ (2026-09-10, kullanıcı kararı).
 *
 * Onaya gönderilen ürün (PENDING) admin karar verene dek DEĞİŞTİRİLEMEZ;
 * firma burada ürünü alıcının göreceği hâliyle görür. Gövde herkese açık ürün
 * sayfasıyla AYNI bileşen (`ProductDetailBody`) — ayrı bir "önizleme şablonu"
 * yazılmadı, iki görünüm sessizce ayrışmasın. Form kontrolü YOK; tek eylem
 * yayındaki ürünü vitrinden çekmek (içerik değişikliği değil).
 */
export function ProductPreview({
  product,
  item,
  onClose,
}: {
  product: ProductShowcase;
  item: Pick<CatalogItem, "brand" | "mpn" | "specification">;
  onClose: () => void;
}) {
  const { company: auth } = useCompanyAuth();
  const profile = useCompanyProfile();
  const cats = useCategoriesByIds(product.categoryId ? [product.categoryId] : []);
  const publish = usePublishProduct();
  const canManage = useHasCompanyPermission("sell:product:manage");
  const status = PRODUCT_STATUS[productStatusKey(product)];

  const view = useMemo<PublicProduct>(() => {
    const defs = new Map(product.attributeDefs.map((d) => [d.key, d]));
    const attributeList = Object.entries(product.attributes ?? {})
      .filter(([k, v]) => defs.has(k) && (Array.isArray(v) ? v.length > 0 : v !== ""))
      .map(([k, v]) => ({
        key: k,
        label: defs.get(k)!.nameTr,
        value: Array.isArray(v) ? v.join(", ") : String(v),
        unit: defs.get(k)!.unit,
      }));
    const cat = cats.data?.find((c) => c.id === product.categoryId);
    return {
      slug: product.slug ?? product.id,
      name: product.name,
      images: product.images,
      priceMode: product.priceMode,
      unit: product.unit,
      categoryId: product.categoryId,
      priceAmount: product.priceAmount,
      priceTiers: product.priceTiers,
      priceCurrency: product.priceCurrency,
      moq: product.moq,
      description: product.description,
      specification: item.specification ?? null,
      brand: item.brand ?? null,
      mpn: item.mpn ?? null,
      unitCode: product.unitCode,
      videoUrl: product.videoUrl,
      externalUrl: product.externalUrl,
      documents: product.documents,
      keywords: product.keywords,
      attributes: product.attributes,
      attributeList,
      category: cat ? { id: cat.id, name: cat.nameTr } : null,
      publishedAt: product.publishedAt,
      updatedAt: new Date().toISOString(),
    };
  }, [product, item, cats.data]);

  const company: PublicProductCompany = {
    name: profile.data?.name ?? auth?.name ?? "",
    slug: auth?.slug ?? null,
    city: profile.data?.city ?? null,
    country: profile.data?.country ?? null,
    logoUrl: profile.data?.logoUrl ?? null,
    industry: profile.data?.industry ?? null,
    activities: [],
    verified: auth?.companyVerificationStatus === "VERIFIED",
    foundedYear: profile.data?.foundedYear ?? null,
    employeeCount: profile.data?.employeeCount ?? null,
    certifications: profile.data?.certifications ?? [],
  };

  return (
    <div>
      <div
        role="status"
        className="flex flex-wrap items-start gap-3 rounded-2xl bg-amber-50 px-4 py-3 text-sm text-amber-900 ring-1 ring-amber-600/20"
      >
        <LockClosedIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="flex flex-wrap items-center gap-2 font-semibold">
            İncelemede — önizleme
            <Badge color={status.color}>{status.label}</Badge>
            {product.submittedAt ? (
              <span className="text-xs font-normal text-amber-800">gönderim {formatDate(product.submittedAt, "datetime")}</span>
            ) : null}
          </p>
          <p className="mt-0.5 text-xs/5">
            Onaya gönderilen ürün ekibimiz karar verene kadar değiştirilemez. Onaylanırsa vitrine çıkar; düzeltme gerekirse
            gerekçesiyle size geri gelir, düzenleyip yeniden gönderirsiniz. Aşağısı alıcının göreceği hâl.
          </p>
        </div>
        {canManage && product.isPublic ? (
          <button
            type="button"
            disabled={publish.isPending}
            onClick={async () => {
              if (!window.confirm("Ürün vitrinden çekilecek ve taslağa dönecek; bekleyen inceleme düşer, yeniden çıkmak için tekrar onay gerekir. Devam edilsin mi?")) return;
              try {
                await publish.mutateAsync({ id: product.id, publish: false });
                toast.success("Ürün vitrinden çekildi");
                onClose();
              } catch {
                toast.error("Vitrinden çekilemedi");
              }
            }}
            className="rounded-full border border-amber-700/30 px-3 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-50"
          >
            Vitrinden çek
          </button>
        ) : null}
      </div>

      <ProductDetailBody
        product={view}
        company={company}
        companyHref="/company/sirketim/profil"
        stickyTopClass="lg:top-14"
        cta={
          <p className="rounded-xl bg-zinc-100 px-4 py-2.5 text-center text-sm text-zinc-500" aria-disabled>
            Alıcı burada “Bilgi iste” düğmesini görür
          </p>
        }
      />
    </div>
  );
}
