"use client";

import { useAuthStore } from "@/lib/auth/store";
import type { PublicTenantProfile } from "@/lib/public/fetch-tenant";
import { cn } from "@/lib/utils";
import {
  Award,
  Calendar,
  Globe,
  Handshake,
  Info,
  Instagram,
  Linkedin,
  MapPin,
  Pencil,
  ShieldCheck,
  Sparkles,
  Users,
} from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

interface Props {
  profile: PublicTenantProfile;
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

export function PublicTenantProfileView({ profile }: Props) {
  const router = useRouter();
  const becomeSupplierHref = `/register/supplier?connect=${encodeURIComponent(
    profile.slug,
  )}`;
  const goBecomeSupplier = () => router.push(becomeSupplierHref);

  // Sahibi (giriş yapmış aynı tenant) bu sayfayı görürken "Düzenle" çubuğu görür.
  const authUser = useAuthStore((s) => s.user);
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);
  const isOwner = mounted && authUser?.tenant?.slug === profile.slug;

  const hasSocial = Boolean(
    profile.website || profile.linkedinUrl || profile.instagramUrl,
  );

  return (
    <div className="bg-surface-subtle pb-12">
      {/* Sahibi için düzenleme çubuğu */}
      {isOwner ? (
        <div className="border-b border-brand-100 bg-brand-50">
          <div className="mx-auto max-w-5xl px-4 md:px-6 py-2.5 flex flex-wrap items-center justify-between gap-2">
            <p className="text-sm text-brand-800 inline-flex items-center gap-1.5">
              <Pencil className="h-3.5 w-3.5" />
              Bu sizin firma profiliniz — tedarikçiler bu sayfayı görür.
            </p>
            <button
              type="button"
              onClick={() => router.push("/dashboard/ayarlar/firma-profili")}
              className="inline-flex items-center gap-1.5 rounded-lg bg-white border border-brand-200 px-3 py-1.5 text-sm font-semibold text-brand-700 hover:bg-brand-50"
            >
              <Pencil className="h-4 w-4" />
              Profili Düzenle
            </button>
          </div>
        </div>
      ) : null}

      {/* ============================================================
       * HERO — cover + profil kartı + Tedarikçi Ol CTA
       * ============================================================ */}
      <div className="relative">
        <div
          className={cn(
            "h-56 md:h-80 w-full relative",
            !profile.coverImageUrl &&
              "bg-gradient-to-br from-brand-600 via-brand-700 to-brand-900",
          )}
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
        >
          {profile.coverImageUrl ? (
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          ) : (
            <div
              className="absolute inset-0 opacity-[0.08]"
              style={{
                backgroundImage:
                  "radial-gradient(circle at 1px 1px, white 1px, transparent 0)",
                backgroundSize: "24px 24px",
              }}
            />
          )}
        </div>

        {/* Profil header kartı — cover'a binmiş */}
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="bg-white rounded-2xl shadow-lg border border-surface-border -mt-16 md:-mt-20 relative">
            <div className="p-5 md:p-7 grid grid-cols-1 lg:grid-cols-[auto,1fr,auto] gap-5 lg:gap-7 items-start">
              {/* Logo / initials */}
              <div className="-mt-14 md:-mt-16 shrink-0">
                <div
                  className={cn(
                    "w-24 h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden ring-4 ring-white shadow-lg",
                    !profile.logoUrl &&
                      "bg-gradient-to-br from-brand-100 to-brand-200 text-brand-700 flex items-center justify-center text-3xl md:text-4xl font-bold font-display",
                  )}
                >
                  {profile.logoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img
                      src={profile.logoUrl}
                      alt={`${profile.name} logosu`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials(profile.name)
                  )}
                </div>
              </div>

              {/* Identity */}
              <div className="min-w-0 space-y-3">
                <div>
                  <h1 className="font-display font-bold text-3xl md:text-4xl text-brand-900 leading-tight tracking-tight break-words">
                    {profile.name}
                  </h1>
                  {profile.industry ? (
                    <p className="text-sm md:text-base text-slate-600 font-medium mt-1">
                      {profile.industry}
                    </p>
                  ) : null}
                </div>

                <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm">
                  {profile.city ? (
                    <Badge icon={MapPin}>{profile.city}</Badge>
                  ) : null}
                  {profile.foundedYear ? (
                    <Badge icon={Calendar}>Kuruluş {profile.foundedYear}</Badge>
                  ) : null}
                  {profile.employeeCount ? (
                    <Badge icon={Users}>{profile.employeeCount} çalışan</Badge>
                  ) : null}
                </div>

                {hasSocial ? (
                  <div className="flex items-center gap-2 lg:hidden pt-1">
                    <SocialIcons profile={profile} />
                  </div>
                ) : null}
              </div>

              {/* Sağ blok: Tedarikçi Ol CTA + sosyal */}
              <div className="flex flex-col gap-3 lg:items-end lg:min-w-[200px]">
                <button
                  type="button"
                  onClick={goBecomeSupplier}
                  className={cn(
                    "inline-flex items-center justify-center gap-2 px-5 py-2.5 rounded-lg",
                    "bg-brand-600 hover:bg-brand-700 text-white text-sm font-semibold",
                    "transition-colors w-full lg:w-auto shadow-sm",
                  )}
                >
                  <Handshake className="h-4 w-4" />
                  Tedarikçi Ol
                </button>
                {/* Sosyal ikonlar + Web Sitesi — yan yana */}
                <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                  <div className="hidden lg:flex items-center gap-2">
                    <SocialIcons profile={profile} />
                  </div>
                  {profile.website ? (
                    <a
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center justify-center gap-2 px-4 py-2 rounded-lg border border-surface-border bg-white text-sm font-semibold text-brand-700 hover:bg-brand-50 transition-colors"
                    >
                      <Globe className="h-4 w-4" />
                      Web Sitesi
                    </a>
                  ) : null}
                </div>
              </div>
            </div>

            {/* Stats şeridi */}
            <div className="grid grid-cols-2 border-t border-surface-border divide-x divide-surface-border">
              <Stat
                label="Kuruluş"
                value={profile.foundedYear ? String(profile.foundedYear) : "—"}
                hint={profile.foundedYear ? "yılı" : "Belirtilmemiş"}
              />
              <Stat
                label="Çalışan"
                value={profile.employeeCount ?? "—"}
                hint={profile.employeeCount ? "kişi" : "Belirtilmemiş"}
              />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
       * BÖLÜMLER
       * ============================================================ */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6 space-y-6">
        {/* Tedarikçi Ol vurgu kartı */}
        <section className="bg-gradient-to-br from-brand-600 to-brand-800 rounded-2xl shadow-lg p-6 md:p-7 text-white">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div>
              <h2 className="font-display font-bold text-xl">
                {profile.name} ile çalışın
              </h2>
              <p className="text-sm text-white/80 mt-1 max-w-xl">
                Firma bilgilerinizi ve belgelerinizi göndererek tedarikçi olma
                isteği gönderin. Başvurunuz doğrulandıktan sonra firmanın onayına
                sunulur.
              </p>
            </div>
            <button
              type="button"
              onClick={goBecomeSupplier}
              className="shrink-0 inline-flex items-center justify-center gap-2 px-5 py-3 rounded-lg bg-white text-brand-700 font-semibold hover:bg-brand-50 transition-colors"
            >
              <Handshake className="h-5 w-5" />
              Tedarikçi Olmak İçin Başvur
            </button>
          </div>
        </section>

        {profile.aboutText ? (
          <Section icon={Info} title="Hakkımızda">
            <p className="text-[15px] text-slate-700 leading-relaxed whitespace-pre-line">
              {profile.aboutText}
            </p>
          </Section>
        ) : null}

        {profile.services.length > 0 ? (
          <Section icon={Sparkles} title="Hizmetler">
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => (
                <span
                  key={s}
                  className="inline-flex items-center px-3 py-1.5 rounded-full bg-brand-50 border border-brand-100 text-sm text-brand-700 font-medium"
                >
                  {s}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        {profile.certifications.length > 0 ? (
          <Section icon={ShieldCheck} title="Sertifikalar ve Ödüller">
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((c) => (
                <span
                  key={c}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-emerald-50 border border-emerald-200 text-sm text-emerald-700 font-medium"
                >
                  <Award className="h-3.5 w-3.5" />
                  {c}
                </span>
              ))}
            </div>
          </Section>
        ) : null}

        <Section icon={Globe} title="İletişim">
          <ul className="space-y-2.5 text-sm">
            {profile.website ? (
              <ContactLink
                icon={Globe}
                href={profile.website}
                label={profile.website.replace(/^https?:\/\//, "")}
              />
            ) : null}
            {profile.linkedinUrl ? (
              <ContactLink
                icon={Linkedin}
                href={profile.linkedinUrl}
                label="LinkedIn"
              />
            ) : null}
            {profile.instagramUrl ? (
              <ContactLink
                icon={Instagram}
                href={profile.instagramUrl}
                label="Instagram"
              />
            ) : null}
            {profile.city ? (
              <li className="inline-flex items-center gap-2.5 text-slate-700">
                <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-slate-100 text-slate-500">
                  <MapPin className="h-4 w-4" />
                </span>
                {profile.city}
              </li>
            ) : null}
          </ul>
        </Section>
      </div>
    </div>
  );
}

function Section({
  icon: Icon,
  title,
  children,
}: {
  icon: typeof Globe;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="bg-white rounded-2xl shadow-card border border-surface-border p-5 md:p-6">
      <h2 className="font-display font-bold text-lg text-brand-900 mb-4 inline-flex items-center gap-2">
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-4 w-4" />
        </span>
        {title}
      </h2>
      {children}
    </section>
  );
}

function Badge({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md bg-slate-50 border border-slate-200 text-slate-700 font-medium">
      <Icon className="h-3.5 w-3.5 text-slate-500" />
      {children}
    </span>
  );
}

function SocialIcons({ profile }: { profile: PublicTenantProfile }) {
  const items: { icon: typeof Globe; href: string; label: string }[] = [];
  if (profile.linkedinUrl)
    items.push({ icon: Linkedin, href: profile.linkedinUrl, label: "LinkedIn" });
  if (profile.instagramUrl)
    items.push({
      icon: Instagram,
      href: profile.instagramUrl,
      label: "Instagram",
    });
  if (items.length === 0) return null;
  return (
    <>
      {items.map(({ icon: Icon, href, label }) => (
        <a
          key={label}
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={label}
          title={label}
          className={cn(
            "inline-flex items-center justify-center w-9 h-9 rounded-lg",
            "bg-slate-100 hover:bg-brand-50 text-slate-600 hover:text-brand-700",
            "border border-surface-border transition-colors",
          )}
        >
          <Icon className="h-4 w-4" />
        </a>
      ))}
    </>
  );
}

function Stat({
  label,
  value,
  hint,
}: {
  label: string;
  value: string;
  hint?: string;
}) {
  return (
    <div className="px-4 py-3 text-center">
      <div className="text-[10px] uppercase tracking-wider text-slate-500 font-semibold">
        {label}
      </div>
      <div className="font-display font-bold text-xl text-brand-900 mt-0.5 tabular-nums">
        {value}
      </div>
      {hint ? <div className="text-[11px] text-slate-500 mt-0.5">{hint}</div> : null}
    </div>
  );
}

function ContactLink({
  icon: Icon,
  href,
  label,
}: {
  icon: typeof Globe;
  href: string;
  label: string;
}) {
  return (
    <li>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-2.5 text-brand-700 hover:underline group"
      >
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-brand-50 text-brand-600 group-hover:bg-brand-100">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </a>
    </li>
  );
}
