import { MarketingHeader } from "@/components/marketing/marketing-header";
import { MarketplaceFooter } from "@/components/marketplace/marketplace-footer";
import { MARKETPLACE_LIVE } from "@/lib/public/marketplace-live";
import { resolveApiBaseUrl } from "@/lib/resolve-api-url";
import {
  CheckCircleIcon,
  ExclamationTriangleIcon,
} from "@heroicons/react/20/solid";
import type { Metadata } from "next";
import Link from "next/link";
import { notFound } from "next/navigation";

/**
 * MİSAFİR TALEBİ ONAY SAYFASI — e-postadaki bağlantı buraya düşer.
 *
 * Doğrulama SUNUCUDA yapılır: bağlantıya tıklamak talebi satıcıya ileten
 * adımdır ve istemciye bırakılamaz.
 *
 * `noindex`: tek kullanımlık jeton taşıyan bir adres; arama motorunun
 * indekslemesinin anlamı yok, üstelik jetonun sızma yüzeyini büyütür.
 */
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Talebinizi onaylayın",
  robots: { index: false, follow: false },
};

interface VerifyResult {
  ok: true;
  productName: string;
  companyName: string;
  email: string;
}

async function verify(token: string): Promise<VerifyResult | { error: string }> {
  const base = resolveApiBaseUrl();
  if (!base) return { error: "Doğrulama servisi şu an kullanılamıyor." };
  try {
    const res = await fetch(
      `${base}/public/inquiries/verify?t=${encodeURIComponent(token)}`,
      { cache: "no-store" },
    );
    if (!res.ok) {
      const body = (await res.json().catch(() => null)) as
        | { message?: string }
        | null;
      return {
        error:
          body?.message ??
          "Bağlantı geçersiz veya süresi dolmuş. Talebi yeniden gönderin.",
      };
    }
    return (await res.json()) as VerifyResult;
  } catch {
    return { error: "Doğrulama sırasında bir sorun oluştu." };
  }
}

export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ t?: string }>;
}) {
  if (!MARKETPLACE_LIVE) notFound();
  const { t } = await searchParams;
  const result = t ? await verify(t) : { error: "Bağlantı eksik." };
  const ok = "ok" in result;

  return (
    <div className="min-h-dvh bg-white">
      <MarketingHeader />
      <main className="mx-auto max-w-2xl px-6 pt-32 pb-24 lg:px-8">
        {ok ? (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-emerald-50 ring-1 ring-emerald-600/20">
              <CheckCircleIcon aria-hidden className="size-6 text-emerald-600" />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">
              Talebiniz iletildi
            </h1>
            <p className="mt-4 text-base/7 text-zinc-600">
              <strong className="text-zinc-900">{result.productName}</strong>{" "}
              hakkındaki talebiniz {result.companyName} firmasına ulaştı.
              Yanıtladıklarında size haber vereceğiz.
            </p>

            {/* Kayıt teşviki: yanıtın İÇERİĞİ hesapta okunur. Bildirim
                e-postasına içeriği koymuyoruz — koysaydık kayıt için bir
                sebep kalmaz, platform ücretsiz bir e-posta rölesine dönerdi. */}
            <div className="mt-8 rounded-2xl bg-zinc-50 p-6 ring-1 ring-zinc-950/5">
              <h2 className="text-base font-semibold text-zinc-950">
                Yanıtı okumak için ücretsiz hesap açın
              </h2>
              <p className="mt-2 text-sm/6 text-zinc-600">
                Aynı e-posta adresiyle ({result.email}) kaydolduğunuzda bu
                talebiniz ve gelen yanıtlar hesabınıza bağlanır.
              </p>
              <div className="mt-5 flex flex-wrap gap-3">
                <Link
                  href={`/company/kayit?email=${encodeURIComponent(result.email)}`}
                  className="rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
                >
                  Ücretsiz kaydol
                </Link>
                <Link
                  href="/company/login"
                  className="rounded-full border border-zinc-300 px-5 py-2.5 text-sm font-semibold text-zinc-900 transition hover:bg-white"
                >
                  Zaten hesabım var
                </Link>
              </div>
            </div>
          </>
        ) : (
          <>
            <span className="flex size-12 items-center justify-center rounded-full bg-amber-50 ring-1 ring-amber-600/20">
              <ExclamationTriangleIcon
                aria-hidden
                className="size-6 text-amber-600"
              />
            </span>
            <h1 className="mt-6 text-3xl font-semibold tracking-tight text-zinc-950">
              Talep onaylanamadı
            </h1>
            <p className="mt-4 text-base/7 text-zinc-600">{result.error}</p>
            <Link
              href="/"
              className="mt-8 inline-flex rounded-full bg-zinc-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800"
            >
              Pazar yerine dön
            </Link>
          </>
        )}
      </main>
      <MarketplaceFooter />
    </div>
  );
}
