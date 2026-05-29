import type { PublicSupplierProfile } from "@/lib/public/types";
import { Award, Globe, Instagram, Linkedin, MapPin } from "lucide-react";

interface Props {
  profile: PublicSupplierProfile;
}

function initials(name: string): string {
  return (
    name
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0]?.toUpperCase() ?? "")
      .join("") || "?"
  );
}

function yearsSince(iso: string): number {
  const years =
    (Date.now() - new Date(iso).getTime()) / (1000 * 60 * 60 * 24 * 365.25);
  return Math.max(1, Math.floor(years));
}

export function PublicSupplierProfileView({ profile }: Props) {
  return (
    <div className="bg-surface-subtle pb-8">
      {/* Cover */}
      <div
        className="h-48 md:h-64 w-full bg-gradient-to-br from-brand-500 via-brand-600 to-brand-800 relative"
        style={
          profile.coverImageUrl
            ? {
                backgroundImage: `url(${profile.coverImageUrl})`,
                backgroundSize: "cover",
                backgroundPosition: "center",
              }
            : undefined
        }
        aria-hidden
      />

      <div className="max-w-5xl mx-auto px-4 md:px-6 relative">
        {/* Avatar + Header kartı */}
        <div className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 flex items-start gap-4 md:gap-6 flex-wrap -mt-12 md:-mt-16">
          <div className="w-20 h-20 md:w-24 md:h-24 rounded-2xl bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center text-2xl md:text-3xl font-bold font-display border-4 border-white shadow-sm -mt-12 md:-mt-16 shrink-0">
            {initials(profile.companyName)}
          </div>
          <div className="flex-1 min-w-0">
            <h1 className="font-display font-bold text-2xl sm:text-3xl text-brand-900 leading-tight">
              {profile.companyName}
            </h1>
            <div className="flex items-center gap-x-3 gap-y-1 flex-wrap mt-2 text-sm text-slate-600">
              {profile.industry && <span>{profile.industry}</span>}
              <span className="inline-flex items-center gap-1">
                <MapPin className="h-3.5 w-3.5" /> {profile.city} /{" "}
                {profile.district}
              </span>
              <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-md bg-yellow-50 border border-yellow-200 text-yellow-700 text-xs font-bold">
                <Award className="h-3 w-3" /> PREMIUM
              </span>
              <span className="text-slate-400" aria-hidden>
                ·
              </span>
              <span>
                {yearsSince(profile.memberSinceIso)} yıldır Supkeys üyesi
              </span>
            </div>
          </div>
        </div>

        {/* Hakkımızda */}
        {profile.aboutText && (
          <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 mt-5">
            <h2 className="font-display font-bold text-lg text-brand-900 mb-3">
              Hakkımızda
            </h2>
            <p className="text-sm text-slate-700 leading-relaxed whitespace-pre-line">
              {profile.aboutText}
            </p>
          </section>
        )}

        {/* Hizmetler */}
        {profile.services.length > 0 && (
          <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 mt-5">
            <h2 className="font-display font-bold text-lg text-brand-900 mb-3">
              Hizmetler
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-brand-50 border border-brand-200 text-sm text-brand-700 font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Kategoriler */}
        {profile.categories.length > 0 && (
          <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 mt-5">
            <h2 className="font-display font-bold text-lg text-brand-900 mb-3">
              Kategoriler
            </h2>
            <div className="flex flex-wrap gap-2">
              {profile.categories.map((c) => (
                <span
                  key={c.id}
                  className="inline-flex items-center px-3 py-1 rounded-full bg-slate-100 border border-slate-200 text-sm text-slate-700"
                >
                  {c.nameTr}
                </span>
              ))}
            </div>
          </section>
        )}

        {/* Galeri */}
        {profile.photos.length > 0 && (
          <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 mt-5">
            <h2 className="font-display font-bold text-lg text-brand-900 mb-3">
              Galeri
            </h2>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {profile.photos.map((p) => (
                <figure
                  key={p.id}
                  className="aspect-square rounded-xl overflow-hidden bg-slate-100 relative"
                >
                  {/* Public sayfa galeri görseli — R2 external URL, next/image
                      whitelist gerektirir; Faz 3 (SEO/polish) içinde geçilir. */}
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={p.url}
                    alt={p.caption ?? "Galeri görseli"}
                    className="w-full h-full object-cover"
                    loading="lazy"
                  />
                  {p.caption && (
                    <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </section>
        )}

        {/* İletişim */}
        <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6 mt-5">
          <h2 className="font-display font-bold text-lg text-brand-900 mb-3">
            İletişim
          </h2>
          <ul className="space-y-2 text-sm">
            {profile.website && (
              <li>
                <a
                  href={profile.website}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-700 hover:underline"
                >
                  <Globe className="h-4 w-4" /> {profile.website}
                </a>
              </li>
            )}
            {profile.linkedinUrl && (
              <li>
                <a
                  href={profile.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-700 hover:underline"
                >
                  <Linkedin className="h-4 w-4" /> LinkedIn
                </a>
              </li>
            )}
            {profile.instagramUrl && (
              <li>
                <a
                  href={profile.instagramUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 text-brand-700 hover:underline"
                >
                  <Instagram className="h-4 w-4" /> Instagram
                </a>
              </li>
            )}
            <li className="inline-flex items-center gap-2 text-slate-700">
              <MapPin className="h-4 w-4" /> {profile.city} / {profile.district}
            </li>
          </ul>
        </section>
      </div>
    </div>
  );
}
