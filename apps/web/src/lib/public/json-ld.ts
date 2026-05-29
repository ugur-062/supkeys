import type { PublicSupplierProfile } from "./types";

/**
 * V2-SEO — JSON-LD structured data (schema.org Organization).
 *
 * Google bunu okuyup arama sonuçlarında:
 *  - Yıldız değerlendirmesi (aggregateRating)
 *  - Yorum sayısı (reviewCount)
 *  - Yorumlar (review array)
 *  - Sosyal medya linkleri (sameAs)
 * olarak zengin görünüm sağlar.
 */
export function buildOrganizationJsonLd(
  profile: PublicSupplierProfile,
  canonicalUrl: string,
): Record<string, unknown> {
  const data: Record<string, unknown> = {
    "@context": "https://schema.org",
    "@type": "Organization",
    name: profile.companyName,
    url: canonicalUrl,
    address: {
      "@type": "PostalAddress",
      addressLocality: profile.city,
      addressRegion: profile.district,
      addressCountry: "TR",
    },
  };

  if (profile.coverImageUrl) {
    data.image = profile.coverImageUrl;
  }

  if (profile.aboutText) {
    // Google description ~500 char limit önerir
    data.description = profile.aboutText.slice(0, 500);
  }

  const sameAs: string[] = [];
  if (profile.website) sameAs.push(profile.website);
  if (profile.linkedinUrl) sameAs.push(profile.linkedinUrl);
  if (profile.instagramUrl) sameAs.push(profile.instagramUrl);
  if (sameAs.length > 0) data.sameAs = sameAs;

  // AggregateRating: sadece yıldız varsa Google yıldız gösterir
  if (profile.rating.count > 0 && profile.rating.average !== null) {
    data.aggregateRating = {
      "@type": "AggregateRating",
      ratingValue: profile.rating.average,
      reviewCount: profile.rating.count,
      bestRating: 5,
      worstRating: 1,
    };
  }

  // Review array (max 10 — backend zaten 10 ile sınırlıyor)
  if (profile.reviews.length > 0) {
    data.review = profile.reviews.map((r) => {
      const review: Record<string, unknown> = {
        "@type": "Review",
        author: { "@type": "Organization", name: r.reviewerName },
        datePublished: r.createdAt.slice(0, 10),
        reviewRating: {
          "@type": "Rating",
          ratingValue: r.rating,
          bestRating: 5,
          worstRating: 1,
        },
      };
      if (r.reviewText) review.reviewBody = r.reviewText;
      return review;
    });
  }

  return data;
}
