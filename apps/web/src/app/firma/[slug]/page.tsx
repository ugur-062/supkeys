import { fetchPublicTenant } from "@/lib/public/fetch-tenant";
import { resolveSiteUrl } from "@/lib/site-url";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PublicTenantProfileView } from "./_components/profile-view";

interface Props {
  params: Promise<{ slug: string }>;
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { slug } = await params;
  const profile = await fetchPublicTenant(slug);
  if (!profile) return { title: "Profil bulunamadı — Supkeys" };

  const siteUrl = resolveSiteUrl();
  const description = (
    profile.aboutText ??
    `${profile.name}${profile.industry ? ` — ${profile.industry}` : ""}${
      profile.city ? `, ${profile.city}` : ""
    }.`
  ).slice(0, 160);

  return {
    metadataBase: new URL(siteUrl),
    title: `${profile.name} — Supkeys`,
    description,
    alternates: { canonical: `/firma/${profile.slug}` },
    openGraph: {
      title: profile.name,
      description,
      url: `/firma/${profile.slug}`,
      siteName: "Supkeys",
      type: "profile",
      locale: "tr_TR",
    },
  };
}

export default async function PublicTenantProfilePage({ params }: Props) {
  const { slug } = await params;
  const profile = await fetchPublicTenant(slug);
  if (!profile) notFound();

  return <PublicTenantProfileView profile={profile} />;
}
