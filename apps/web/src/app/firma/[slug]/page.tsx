import { CompanyProfileView } from "@/components/company/company-profile-view";
import { serializeJsonLd } from "@/lib/json-ld";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

export const revalidate = 300;

interface PublicProfile {
  name: string;
  goldMember?: boolean;
  slug: string | null;
  rothernId: string | null;
  industry: string | null;
  city: string | null;
  country: string | null;
  logoUrl: string | null;
  coverImageUrl: string | null;
  aboutText: string | null;
  services: string[];
  certifications: string[];
  photos: string[];
  certificateImages: string[];
  foundedYear: number | null;
  employeeCount: string | null;
  website: string | null;
  linkedinUrl: string | null;
  instagramUrl: string | null;
  rating: { avg: number; count: number } | null;
}

function apiBase() {
  // resolve-api-url ile aynı kural: prod'da env eksikse localhost'a DÜŞME —
  // boş base SSR fetch'ini try/catch'e düşürür (profil "bulunamadı" olur),
  // localhost'a istek atmaktan iyidir.
  if (process.env.NEXT_PUBLIC_API_URL) return process.env.NEXT_PUBLIC_API_URL;
  return process.env.NODE_ENV === "production"
    ? ""
    : "http://localhost:4000/api";
}
function siteUrl() {
  return process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000";
}

async function fetchProfile(slug: string): Promise<PublicProfile | null> {
  try {
    const res = await fetch(
      `${apiBase()}/public/companies/${encodeURIComponent(slug)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as PublicProfile;
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ slug: string }>;
}): Promise<Metadata> {
  const { slug } = await params;
  const p = await fetchProfile(slug);
  if (!p) return { title: "Firma bulunamadı — Rothern" };

  const title = `${p.name} — Rothern`;
  const description = (
    p.aboutText?.trim().slice(0, 160) ||
    `${p.name}${p.industry ? ` · ${p.industry}` : ""}${
      p.city ? ` · ${p.city}` : ""
    } — Rothern üzerinde tedarik profili.`
  ).trim();
  const url = `${siteUrl()}/firma/${slug}`;
  const image = p.coverImageUrl ?? p.logoUrl ?? undefined;

  return {
    title,
    description,
    alternates: { canonical: url },
    openGraph: {
      title,
      description,
      url,
      type: "profile",
      siteName: "Rothern",
      images: image ? [{ url: image }] : undefined,
    },
    twitter: {
      card: image ? "summary_large_image" : "summary",
      title,
      description,
      images: image ? [image] : undefined,
    },
  };
}

export default async function PublicCompanyProfile({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const p = await fetchProfile(slug);
  if (!p) notFound();

  const url = `${siteUrl()}/firma/${slug}`;
  const sameAs = [p.website, p.linkedinUrl, p.instagramUrl].filter(
    Boolean,
  ) as string[];

  const jsonLd = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: p.name,
    url,
    ...(p.logoUrl ? { logo: p.logoUrl } : {}),
    ...(p.coverImageUrl ? { image: p.coverImageUrl } : {}),
    ...(p.aboutText ? { description: p.aboutText } : {}),
    ...(p.foundedYear ? { foundingDate: String(p.foundedYear) } : {}),
    ...(p.city
      ? {
          address: {
            "@type": "PostalAddress",
            addressLocality: p.city,
            addressCountry: p.country ?? "TR",
          },
        }
      : {}),
    ...(sameAs.length ? { sameAs } : {}),
  };

  // GEO/SEO — breadcrumb şeması (arama sonuçlarında yol gösterimi).
  const breadcrumbLd = {
    "@context": "https://schema.org",
    "@type": "BreadcrumbList",
    itemListElement: [
      { "@type": "ListItem", position: 1, name: "Rothern", item: siteUrl() },
      { "@type": "ListItem", position: 2, name: p.name, item: url },
    ],
  };

  return (
    <main className="min-h-screen bg-zinc-50">
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(jsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: serializeJsonLd(breadcrumbLd) }}
      />

      {/* Marka çubuğu — açık */}
      <header className="sticky top-0 z-20 border-b border-zinc-200 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between gap-4 px-4 py-3 sm:px-6">
          <Link href="/" aria-label="Rothern" className="-m-1.5 p-1.5">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/rothern-logo-trans.png"
              alt="Rothern"
              className="h-10 w-auto"
            />
          </Link>
          <div className="flex items-center gap-2">
            <Link
              href="/company/login"
              className="px-3 py-1.5 text-sm font-semibold text-zinc-600 transition hover:text-zinc-900"
            >
              Giriş Yap
            </Link>
            <Link
              href="/company/kayit"
              className="rounded-full bg-zinc-950 px-4 py-1.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Kaydol
            </Link>
          </div>
        </div>
      </header>

      <div className="mx-auto max-w-5xl px-4 pb-16 pt-6 sm:px-6">
        {/* İhaleler yalnızca üyelerde — kayıt CTA'sı */}
        <section className="mb-5 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm sm:px-6">
          <div className="min-w-0">
            <p className="text-sm font-semibold text-zinc-900">
              {p.name} ile alış-satış yapmak için Rothern&apos;e kayıt olun
            </p>
            <p className="mt-0.5 text-xs text-zinc-500">
              Bağlantı kurun, ihalelerini görün, teklif verin — tek panelden
              yönetin.
            </p>
          </div>
          <Link
            href="/company/kayit"
            className="shrink-0 rounded-full bg-zinc-950 px-5 py-2 text-sm font-semibold text-white transition hover:bg-zinc-800"
          >
            Bağlantı İsteği Gönder
          </Link>
        </section>

        <CompanyProfileView profile={p} />

        <footer className="mt-10 flex flex-col items-center gap-2 text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src="/rothern-logo-trans.png"
            alt="Rothern"
            className="h-5 w-auto opacity-50"
          />
          <p className="text-xs text-zinc-400">
            B2B tedarik &amp; e-ihale platformu
          </p>
        </footer>
      </div>
    </main>
  );
}
