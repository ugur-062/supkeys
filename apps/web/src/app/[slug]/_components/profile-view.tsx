import { Badge as CatalystBadge } from "@/components/catalyst/badge";
import { Button } from "@/components/catalyst/button";
import {
  DescriptionDetails,
  DescriptionList,
  DescriptionTerm,
} from "@/components/catalyst/description-list";
import { Subheading } from "@/components/catalyst/heading";
import type {
  PublicSupplierProfile,
  PublicSupplierReview,
} from "@/lib/public/types";
import { cn } from "@/lib/utils";
import { format } from "date-fns";
import { tr } from "date-fns/locale";
import { FallbackImage } from "./fallback-image";
import {
  Award,
  BadgeCheck,
  Building2,
  Calendar,
  FileText,
  Globe,
  ImageIcon,
  Info,
  Instagram,
  Linkedin,
  Mail,
  MapPin,
  MessageSquareQuote,
  ShieldCheck,
  Sparkles,
  Star,
  Tag,
  Users,
} from "lucide-react";

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

function memberSinceLabel(iso: string): string {
  try {
    return format(new Date(iso), "MMMM yyyy", { locale: tr });
  } catch {
    return "";
  }
}

export function PublicSupplierProfileView({ profile }: Props) {
  const hasRating =
    profile.rating.count > 0 && profile.rating.average !== null;
  const hasSocial = Boolean(
    profile.website || profile.linkedinUrl || profile.instagramUrl,
  );
  const memberSince = memberSinceLabel(profile.memberSinceIso);

  return (
    <div className="bg-surface-subtle pb-12">
      {/* ============================================================
       * HERO — cover + profil kartı + rating widget + action butonları
       * ============================================================ */}
      <div className="relative">
        {/* Cover image / gradient — sabit yüksek hero */}
        <div
          className={cn(
            "h-56 md:h-80 w-full relative",
            !profile.coverImageUrl &&
              "bg-gradient-to-br from-zinc-600 via-zinc-700 to-zinc-900",
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
          {/* Cover varsa metin kontrastı için alta koyu gradient overlay */}
          {profile.coverImageUrl && (
            <div className="absolute inset-x-0 bottom-0 h-2/3 bg-gradient-to-t from-black/40 via-black/10 to-transparent" />
          )}
          {/* Cover yoksa subtle pattern overlay */}
          {!profile.coverImageUrl && (
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

        {/* Profil header kartı — cover'a binmiş, asıl identity bloğu */}
        <div className="max-w-5xl mx-auto px-4 md:px-6">
          <div className="bg-white rounded-2xl shadow-sm ring-1 ring-zinc-950/5 -mt-16 md:-mt-20 relative">
            <div className="p-5 md:p-7 grid grid-cols-1 lg:grid-cols-[auto,1fr,auto] gap-5 lg:gap-7 items-start">
              {/* Avatar — logo yüklenmişse onu göster, yoksa initials */}
              <div className="-mt-14 md:-mt-16 shrink-0">
                <div
                  className={cn(
                    "w-24 h-24 md:w-28 md:h-28 rounded-2xl overflow-hidden",
                    "ring-4 ring-white shadow-lg",
                    !profile.logoImageUrl &&
                      "bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700 flex items-center justify-center text-3xl md:text-4xl font-bold font-display",
                  )}
                >
                  {profile.logoImageUrl ? (
                    <FallbackImage
                      src={profile.logoImageUrl}
                      alt={`${profile.companyName} logosu`}
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    initials(profile.companyName)
                  )}
                </div>
              </div>

              {/* Identity bloğu */}
              <div className="min-w-0 space-y-3">
                <div>
                  <h1 className="font-display font-bold text-3xl md:text-4xl text-zinc-900 leading-tight tracking-tight">
                    {profile.companyName}
                  </h1>
                  {profile.industry && (
                    <p className="text-sm md:text-base text-zinc-600 font-medium mt-1">
                      {profile.industry}
                    </p>
                  )}
                </div>

                {/* Meta rozetleri — temiz, ikonlu */}
                <div className="flex items-center gap-2 flex-wrap text-xs md:text-sm">
                  <Badge icon={MapPin}>
                    {profile.city} / {profile.district}
                  </Badge>
                  <PremiumBadge />
                  {profile.verifiedBusiness && <VerifiedBadge />}
                  {profile.companyType === "SOLE_PROPRIETOR" && (
                    <SoleProprietorBadge />
                  )}
                  {profile.foundedYear && (
                    <Badge icon={Calendar}>
                      Kuruluş {profile.foundedYear}
                    </Badge>
                  )}
                  {profile.employeeCount && (
                    <Badge icon={Users}>{profile.employeeCount} çalışan</Badge>
                  )}
                  {memberSince && (
                    <span className="text-zinc-500 inline-flex items-center gap-1.5">
                      <Sparkles
                        className="h-3.5 w-3.5 text-zinc-400"
                        aria-hidden
                      />
                      Üye: {memberSince}
                    </span>
                  )}
                </div>

                {/* Sosyal medya küçük ikon butonları (mobilde burada) */}
                {hasSocial && (
                  <div className="flex items-center gap-2 lg:hidden pt-1">
                    <SocialIcons profile={profile} />
                  </div>
                )}
              </div>

              {/* Sağ blok: rating widget + action butonları */}
              <div className="flex flex-col gap-3 lg:items-end lg:min-w-[200px]">
                {hasRating && <HeroRatingWidget rating={profile.rating} />}

                {/* Sosyal ikonlar + Web Sitesi — yan yana */}
                <div className="flex items-center gap-2 flex-wrap lg:justify-end">
                  <div className="hidden lg:flex items-center gap-2">
                    <SocialIcons profile={profile} />
                  </div>

                  {profile.website && (
                    <Button
                      href={profile.website}
                      target="_blank"
                      rel="noopener noreferrer"
                    >
                      <Globe data-slot="icon" />
                      Web Sitesi
                    </Button>
                  )}
                </div>
              </div>
            </div>

            {/* Hızlı stats şeridi — kartın alt kenarı */}
            <div className="grid grid-cols-2 border-t border-zinc-950/5 divide-x divide-zinc-950/5">
              <Stat
                label="Değerlendirme"
                value={
                  hasRating
                    ? `${profile.rating.average!.toFixed(1)} ★`
                    : "—"
                }
                hint={
                  profile.rating.count > 0
                    ? `${profile.rating.count} yorum`
                    : "Henüz yorum yok"
                }
              />
              <Stat
                label="Kategori"
                value={String(profile.categories.length || "—")}
                hint={
                  profile.categories.length > 0
                    ? "UNSPSC"
                    : "Henüz seçilmemiş"
                }
              />
            </div>
          </div>
        </div>
      </div>

      {/* ============================================================
       * BÖLÜMLER
       * ============================================================ */}
      <div className="max-w-5xl mx-auto px-4 md:px-6 mt-6 space-y-6">
        {/* Hakkımızda */}
        {profile.aboutText && (
          <Section icon={Info} title="Hakkımızda">
            <p className="text-[15px] text-zinc-700 leading-relaxed whitespace-pre-line">
              {profile.aboutText}
            </p>
          </Section>
        )}

        {/* Hizmetler */}
        {profile.services.length > 0 && (
          <Section icon={Sparkles} title="Hizmetler">
            <div className="flex flex-wrap gap-2">
              {profile.services.map((s) => (
                <CatalystBadge key={s}>{s}</CatalystBadge>
              ))}
            </div>
          </Section>
        )}

        {/* Sertifikalar / Ödüller */}
        {profile.certifications.length > 0 && (
          <Section icon={ShieldCheck} title="Sertifikalar ve Ödüller">
            <div className="flex flex-wrap gap-2">
              {profile.certifications.map((c) => (
                <CatalystBadge key={c} color="lime">
                  <Award className="h-3.5 w-3.5" />
                  {c}
                </CatalystBadge>
              ))}
            </div>
          </Section>
        )}

        {/* G9 madde 26 — Yüklenen belge/sertifika dosyaları (indirilebilir) */}
        {profile.certificates.length > 0 && (
          <Section icon={FileText} title="Belgeler">
            <div className="flex flex-wrap gap-2">
              {profile.certificates.map((c) => (
                <a
                  key={c.id}
                  href={c.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-2 px-3 py-2 rounded-lg border border-zinc-950/5 bg-white text-sm font-medium text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 transition-colors"
                >
                  <FileText className="h-4 w-4 text-zinc-400" />
                  {c.name}
                </a>
              ))}
            </div>
          </Section>
        )}

        {/* Tescil Bilgileri — vergi no / vergi dairesi / MERSİS (opt-in) */}
        {(profile.taxNumber || profile.mersisNo) && (
          <Section icon={FileText} title="Tescil Bilgileri">
            <DescriptionList>
              {profile.taxNumber ? (
                <>
                  <DescriptionTerm>Vergi Numarası</DescriptionTerm>
                  <DescriptionDetails className="font-mono">
                    {profile.taxNumber}
                  </DescriptionDetails>
                </>
              ) : null}
              {profile.taxOffice ? (
                <>
                  <DescriptionTerm>Vergi Dairesi</DescriptionTerm>
                  <DescriptionDetails>{profile.taxOffice}</DescriptionDetails>
                </>
              ) : null}
              {profile.mersisNo ? (
                <>
                  <DescriptionTerm>MERSİS Numarası</DescriptionTerm>
                  <DescriptionDetails className="font-mono">
                    {profile.mersisNo}
                  </DescriptionDetails>
                </>
              ) : null}
            </DescriptionList>
            <p className="text-xs text-zinc-500 mt-4 leading-relaxed">
              Bu bilgiler firma tarafından açık paylaşıma onaylanmıştır.
              Doğrulama için{" "}
              <a
                href="https://uyg.gib.gov.tr/Iste/SicilSorgu"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 hover:underline"
              >
                GİB Sicil Sorgu
              </a>{" "}
              ve{" "}
              <a
                href="https://mersis.gtb.gov.tr/"
                target="_blank"
                rel="noopener noreferrer"
                className="text-zinc-700 hover:underline"
              >
                MERSİS
              </a>{" "}
              kullanılabilir.
            </p>
          </Section>
        )}

        {/* Kategoriler */}
        {profile.categories.length > 0 && (
          <Section icon={Tag} title="Kategoriler">
            <div className="flex flex-wrap gap-2">
              {profile.categories.map((c) => (
                <CatalystBadge key={c.id} color="zinc">
                  {c.nameTr}
                </CatalystBadge>
              ))}
            </div>
          </Section>
        )}

        {/* Değerlendirmeler */}
        {profile.rating.count > 0 && (
          <Section icon={MessageSquareQuote} title="Değerlendirmeler">
            <RatingSummary rating={profile.rating} />
            {profile.reviews.length > 0 && (
              <ul className="mt-6 space-y-5">
                {profile.reviews.map((r) => (
                  <ReviewItem key={r.id} review={r} />
                ))}
              </ul>
            )}
          </Section>
        )}

        {/* Galeri */}
        {profile.photos.length > 0 && (
          <Section icon={ImageIcon} title="Galeri">
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {profile.photos.map((p) => (
                <figure
                  key={p.id}
                  className="group aspect-square rounded-xl overflow-hidden bg-zinc-100 relative"
                >
                  <FallbackImage
                    src={p.url}
                    alt={p.caption ?? "Galeri görseli"}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                  />
                  {p.caption && (
                    <figcaption className="absolute bottom-0 left-0 right-0 bg-gradient-to-t from-black/70 to-transparent text-white text-xs p-2.5">
                      {p.caption}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </Section>
        )}

        {/* İletişim */}
        <Section icon={Mail} title="İletişim" id="iletisim">
          <ul className="space-y-2.5 text-sm">
            {profile.website && (
              <ContactLink
                icon={Globe}
                href={profile.website}
                label={profile.website.replace(/^https?:\/\//, "")}
              />
            )}
            {profile.linkedinUrl && (
              <ContactLink
                icon={Linkedin}
                href={profile.linkedinUrl}
                label="LinkedIn"
              />
            )}
            {profile.instagramUrl && (
              <ContactLink
                icon={Instagram}
                href={profile.instagramUrl}
                label="Instagram"
              />
            )}
            <li className="inline-flex items-center gap-2.5 text-zinc-700">
              <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-100 text-zinc-500">
                <MapPin className="h-4 w-4" />
              </span>
              {profile.city} / {profile.district}
            </li>
          </ul>
        </Section>
      </div>
    </div>
  );
}

// ============================================================
// Section wrapper — başlıkta ikon + tutarlı kart stili
// ============================================================
function Section({
  icon: Icon,
  title,
  children,
  id,
}: {
  icon: typeof Globe;
  title: string;
  children: React.ReactNode;
  id?: string;
}) {
  return (
    <section
      id={id}
      className="bg-white rounded-2xl shadow-sm ring-1 ring-zinc-950/5 p-5 md:p-6"
    >
      <div className="mb-4 flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-zinc-100 text-zinc-600">
          <Icon className="h-4 w-4" />
        </span>
        <Subheading>{title}</Subheading>
      </div>
      {children}
    </section>
  );
}

// ============================================================
// Hero rozetleri ve widget'ları
// ============================================================
function Badge({
  icon: Icon,
  children,
}: {
  icon: typeof MapPin;
  children: React.ReactNode;
}) {
  return (
    <CatalystBadge>
      <Icon className="h-3.5 w-3.5" />
      {children}
    </CatalystBadge>
  );
}

function PremiumBadge() {
  return (
    <CatalystBadge color="amber">
      <Award className="h-3.5 w-3.5" />
      PREMIUM
    </CatalystBadge>
  );
}

function VerifiedBadge() {
  return (
    <CatalystBadge title="Supkeys onay sürecinden geçen aktif PREMIUM tedarikçi">
      <BadgeCheck className="h-3.5 w-3.5" />
      Doğrulanmış İşletme
    </CatalystBadge>
  );
}

function SoleProprietorBadge() {
  return (
    <CatalystBadge title="Şahıs işletmesi — KVKK gereği vergi/MERSİS bilgisi paylaşılmaz">
      <Building2 className="h-3.5 w-3.5" />
      Şahıs İşletmesi
    </CatalystBadge>
  );
}

function HeroRatingWidget({
  rating,
}: {
  rating: PublicSupplierProfile["rating"];
}) {
  const avg = rating.average ?? 0;
  return (
    <div
      className={cn(
        "inline-flex items-center gap-3 px-4 py-2.5 rounded-xl",
        "bg-gradient-to-br from-yellow-50 to-amber-50",
        "border border-amber-200",
      )}
    >
      <Star className="h-7 w-7 fill-yellow-400 text-yellow-500" />
      <div className="leading-tight">
        <div className="font-display font-bold text-xl text-amber-900 tabular-nums">
          {avg.toFixed(1)}
        </div>
        <div className="text-[11px] text-amber-700 font-medium">
          {rating.count} değerlendirme
        </div>
      </div>
    </div>
  );
}

function SocialIcons({ profile }: { profile: PublicSupplierProfile }) {
  const items: { icon: typeof Globe; href: string; label: string }[] = [];
  if (profile.linkedinUrl)
    items.push({
      icon: Linkedin,
      href: profile.linkedinUrl,
      label: "LinkedIn",
    });
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
            "bg-zinc-100 hover:bg-zinc-50 text-zinc-600 hover:text-zinc-700",
            "border border-zinc-950/5 transition-colors",
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
      <div className="text-[10px] uppercase tracking-wider text-zinc-500 font-semibold">
        {label}
      </div>
      <div className="font-display font-bold text-xl text-zinc-900 mt-0.5 tabular-nums">
        {value}
      </div>
      {hint && <div className="text-[11px] text-zinc-500 mt-0.5">{hint}</div>}
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
        className="inline-flex items-center gap-2.5 text-zinc-700 hover:underline group"
      >
        <span className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-zinc-50 text-zinc-600 group-hover:bg-zinc-100">
          <Icon className="h-4 w-4" />
        </span>
        {label}
      </a>
    </li>
  );
}

// ============================================================
// V2-REVIEWS — Rating özet (ortalama + yıldızlar + dağılım barı)
// ============================================================

function RatingSummary({
  rating,
}: {
  rating: PublicSupplierProfile["rating"];
}) {
  const avg = rating.average ?? 0;
  const total = rating.count;
  return (
    <div className="grid grid-cols-1 md:grid-cols-[auto,1fr] gap-6 md:gap-8 items-center">
      {/* Sol — büyük ortalama */}
      <div className="text-center md:text-left md:border-r md:border-zinc-950/5 md:pr-8">
        <p className="font-display font-bold text-4xl md:text-5xl text-zinc-900 leading-none">
          {avg.toFixed(1)}
        </p>
        <div className="mt-2 inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={
                avg >= n
                  ? "h-4 w-4 fill-yellow-400 text-yellow-500"
                  : avg >= n - 0.5
                    ? "h-4 w-4 fill-yellow-400/50 text-yellow-500"
                    : "h-4 w-4 text-zinc-300"
              }
            />
          ))}
        </div>
        <p className="text-xs text-zinc-500 mt-2">{total} değerlendirme</p>
      </div>

      {/* Sağ — 5→1 dağılım barı */}
      <div className="space-y-1.5">
        {[5, 4, 3, 2, 1].map((star) => {
          const count = rating.distribution[String(star)] ?? 0;
          const pct = total > 0 ? (count / total) * 100 : 0;
          return (
            <div
              key={star}
              className="flex items-center gap-3 text-xs text-zinc-600"
            >
              <span className="inline-flex items-center gap-0.5 w-6 tabular-nums">
                {star}
                <Star className="h-3 w-3 fill-yellow-400 text-yellow-500" />
              </span>
              <div className="flex-1 h-2 bg-zinc-100 rounded-full overflow-hidden">
                <div
                  className="h-full bg-yellow-400 rounded-full"
                  style={{ width: `${pct}%` }}
                />
              </div>
              <span className="w-8 text-right tabular-nums">{count}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

// ============================================================
// V2-REVIEWS — Tek yorum kartı
// ============================================================

function ReviewItem({ review }: { review: PublicSupplierReview }) {
  const date = (() => {
    try {
      return format(new Date(review.createdAt), "d MMMM yyyy", { locale: tr });
    } catch {
      return "";
    }
  })();
  return (
    <li className="border-t border-zinc-950/5 pt-5 first:border-t-0 first:pt-0">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-full bg-gradient-to-br from-zinc-100 to-zinc-200 text-zinc-700 flex items-center justify-center font-semibold text-sm">
            {initials(review.reviewerName)}
          </div>
          <div>
            <p className="font-semibold text-zinc-900 text-sm">
              {review.reviewerName}
            </p>
            {date && <p className="text-xs text-zinc-500">{date}</p>}
          </div>
        </div>
        <div className="inline-flex items-center gap-0.5">
          {[1, 2, 3, 4, 5].map((n) => (
            <Star
              key={n}
              className={
                review.rating >= n
                  ? "h-3.5 w-3.5 fill-yellow-400 text-yellow-500"
                  : "h-3.5 w-3.5 text-zinc-300"
              }
            />
          ))}
        </div>
      </div>
      {review.reviewText && (
        <p className="text-sm text-zinc-700 mt-3 whitespace-pre-line leading-relaxed">
          {review.reviewText}
        </p>
      )}
    </li>
  );
}
