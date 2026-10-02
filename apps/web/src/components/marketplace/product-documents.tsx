"use client";

import { useTranslations } from "next-intl";
import { useQuery } from "@tanstack/react-query";
import { DocumentTextIcon, LockClosedIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useHydrated } from "@/hooks/use-hydrated";
import { companyApi } from "@/lib/company-auth/api";
import { useCompanyAuthStore } from "@/lib/company-auth/store";

export interface ProductDocument {
  url?: string;
  title: string;
}

/** Üye belge ucu — oturum yeter (görünürlük tablosu `documentDownload: member`). */
export function memberDocumentsPath(companySlug: string, productSlug: string): string {
  return `/company/market/documents/${encodeURIComponent(companySlug)}/${encodeURIComponent(productSlug)}`;
}

/**
 * ÜRÜN BELGELERİ (T-18 / D-331; webA-03 yeniden doğrulama).
 *
 * Herkese açık uç belgenin yalnız ADINI verir; indirme üyeye. Eskiden kilitli
 * listenin altındaki "Belgeyi indirmek için giriş yapın" bağlantısı oturumu
 * OLAN kullanıcıya da basılıyordu: tıklayınca üye ürün sayfasına gidiyor, orada
 * `buy:view` yoksa (satış koltuğu, görüntüleyici) geri gönderiliyordu — döngü.
 * Artık oturumlu üyede adresler üye ucundan (`/company/market/documents`)
 * çekilir ve doğrudan indirme bağlantısı çizilir; misafir giriş CTA'sını görür.
 * Sunucu HTML'i her zaman misafir hâlidir (oturum yalnız hidrasyondan sonra).
 */
export function ProductDocuments({
  documents,
  companySlug,
  productSlug,
  loginHref,
}: {
  documents: ProductDocument[];
  companySlug?: string;
  productSlug?: string;
  /** Kilitli belgede misafire basılan giriş bağlantısı (yalnız herkese açık sayfa). */
  loginHref?: string;
}) {
  const t = useTranslations("web.marketplace.product");
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const signedIn = useCompanyAuthStore((s) => !!s.user);
  const member = hydrated && storeHydrated && signedIn;
  const locked = documents.some((d) => !d.url);
  const canFetch = member && locked && !!companySlug && !!productSlug;

  const unlocked = useQuery<ProductDocument[]>({
    queryKey: ["member-product-documents", companySlug, productSlug],
    enabled: canFetch,
    queryFn: async () => {
      const { data } = await companyApi.get<{ documents: ProductDocument[] }>(
        memberDocumentsPath(companySlug as string, productSlug as string),
      );
      return data.documents ?? [];
    },
    staleTime: 60_000,
    retry: false,
  });

  const list = canFetch && unlocked.data ? unlocked.data : documents;
  const stillLocked = list.some((d) => !d.url);

  return (
    <div className="max-w-3xl">
      <ul className="space-y-2">
        {list.map((d, i) => (
          <li key={`${i}-${d.title}`}>
            {d.url ? (
              <a
                href={d.url}
                target="_blank"
                rel="noopener noreferrer nofollow"
                className="inline-flex items-center gap-2 text-sm font-medium text-zinc-900 hover:text-zinc-600"
              >
                <DocumentTextIcon aria-hidden className="size-4 text-zinc-400" />
                {d.title}
              </a>
            ) : (
              /* Ad herkese açık, indirme üyeye (T-18 / D-331). */
              <span className="inline-flex items-center gap-2 text-sm font-medium text-zinc-700">
                <DocumentTextIcon aria-hidden className="size-4 text-zinc-400" />
                {d.title}
                <LockClosedIcon aria-hidden className="size-3.5 text-zinc-400" />
              </span>
            )}
          </li>
        ))}
      </ul>
      {stillLocked && !member && loginHref ? (
        <p className="mt-4 text-sm text-zinc-600">
          {t("docsLockedNote")}{" "}
          <Link href={loginHref} className="font-semibold text-blue-700 hover:underline">
            {t("docsLocked")}
          </Link>
        </p>
      ) : null}
      {stillLocked && canFetch && unlocked.isError ? (
        <p className="mt-4 text-sm text-zinc-600">{t("docsLoadError")}</p>
      ) : null}
    </div>
  );
}
