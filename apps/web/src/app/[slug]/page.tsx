import { fetchPublicSupplierProfile } from "@/lib/public/fetch-supplier";
import { buildOrganizationJsonLd } from "@/lib/public/json-ld";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicSupplierProfileView } from "./_components/profile-view";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicSupplierProfile(slug);
  if (!profile) {
    return { title: "Profil bulunamadı — Supkeys" };
  }
  const siteUrl = resolveSiteUrl();
  const canonicalPath = `/${profile.slug}`;
  const description = (
    profile.aboutText ??
    `${profile.companyName}${
      profile.industry ? ` — ${profile.industry}` : ""
    }, ${profile.city}/${profile.district}.`
  ).slice(0, 160);
  return {
    metadataBase: new URL(siteUrl),
    title: `${profile.companyName} — Supkeys`,
    description,
    alternates: { canonical: canonicalPath },
    openGraph: {
      title: profile.companyName,
      description,
      url: canonicalPath,
      siteName: "Supkeys",
      images: profile.coverImageUrl ? [{ url: profile.coverImageUrl }] : [],
      type: "profile",
      locale: "tr_TR",
    },
    twitter: {
      card: profile.coverImageUrl ? "summary_large_image" : "summary",
      title: profile.companyName,
      description,
      images: profile.coverImageUrl ? [profile.coverImageUrl] : undefined,
    },
  };
}

export default async function PublicSupplierProfilePage({ params }: Props) {
  const { slug } = await params;
  const profile = await fetchPublicSupplierProfile(slug);
  if (!profile) notFound();

  // JSON-LD — Organization + AggregateRating + Review (Google zengin sonuç)
  const canonicalUrl = `${resolveSiteUrl()}/${profile.slug}`;
  const jsonLd = buildOrganizationJsonLd(profile, canonicalUrl);

  return (
    <>
      {/* eslint-disable-next-line @next/next/no-css-tags */}
      <script
        type="application/ld+json"
        // SSR'da güvenli — server'da serialize edilir, client'a HTML olarak gider
        dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }}
      />
      <PublicSupplierProfileView profile={profile} />
    </>
  );
}
