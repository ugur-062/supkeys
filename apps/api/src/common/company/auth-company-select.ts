import type { Prisma } from "@rothern/db";

/**
 * Kimlik doğrulama yolunun ihtiyaç duyduğu Company alanları — TEK KAYNAK
 * (denetim 2026-08-28 Parça 12 #12).
 *
 * Sorun: `company-jwt.strategy.ts` HER kimlikli istekte `include: { company:
 * true }` yapıyor, dönüşte aşağıdaki 7 alanı kullanıyordu. `Company` 76 kolonlu
 * ve vitrin bloğu serbest metin/dizi taşıyor (`aboutText` 2000, 12 foto URL'i,
 * 12 sertifika görseli, 6 KYC nesne anahtarı). Dolu profilli bir firma satırı
 * Postgres'in ~2 KB TOAST eşiğini aştığı için satır her okunduğunda ek chunk
 * okuması geliyordu — platformun en yüksek frekanslı sorgusunda.
 *
 * Aynı kapı üç yerde tekrarlanıyor (REST strategy, WS handshake, login) ve
 * gateway'in yorumu "strategy ile senkron tutulmalı" diyor; select'i burada
 * paylaşmak o senkronu derleyici düzeyine taşıyor.
 *
 * DİKKAT: buraya alan eklemek üç sıcak yolu birden etkiler. `/me` ve login
 * yanıtının döndürdüğü tam profil (`serializeCompany`) BİLİNÇLİ olarak bu
 * select'i kullanmaz — orada vitrin verisi gerçekten isteniyor ve çağrı
 * frekansı düşük.
 */
export const AUTH_COMPANY_SELECT = {
  id: true,
  isActive: true,
  isBlocked: true,
  ownerUserId: true,
  tier: true,
  membershipEndAt: true,
  companyVerificationStatus: true,
  country: true,
} satisfies Prisma.CompanySelect;
