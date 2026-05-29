import { fetchPublicSupplierProfile } from "@/lib/public/fetch-supplier";
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
  const description = (
    profile.aboutText ??
    `${profile.companyName}${
      profile.industry ? ` — ${profile.industry}` : ""
    }, ${profile.city}/${profile.district}.`
  ).slice(0, 160);
  return {
    title: `${profile.companyName} — Supkeys`,
    description,
    openGraph: {
      title: profile.companyName,
      description,
      images: profile.coverImageUrl ? [{ url: profile.coverImageUrl }] : [],
      type: "profile",
    },
    twitter: {
      card: profile.coverImageUrl ? "summary_large_image" : "summary",
      title: profile.companyName,
      description,
    },
  };
}

export default async function PublicSupplierProfilePage({ params }: Props) {
  const { slug } = await params;
  const profile = await fetchPublicSupplierProfile(slug);
  if (!profile) notFound();
  return <PublicSupplierProfileView profile={profile} />;
}
