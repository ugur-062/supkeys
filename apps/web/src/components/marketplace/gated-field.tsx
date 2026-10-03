"use client";

import { useTranslations } from "next-intl";
import { useHydrated } from "@/hooks/use-hydrated";
import { useCompanyAuthStore } from "@/lib/company-auth/store";
import { loginHref, signupHref } from "@/lib/public/visibility";
import { AccentLink } from "@/components/ui/accent-fill";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";

/**
 * Satır içi kilit için alan başına TAM cümle (arayüz testi D-083): genel
 * "{label} için giriş yapın" kalıbı EN/RU'da cümle ortasında büyük harfli
 * başlık ve iki nokta bırakıyordu ("Log in to see Company website",
 * "Войдите, чтобы увидеть: Сайт компании").
 */
const SENTENCE_KEY = {
  sellerSite: "loginForSellerSite",
  contact: "loginForContact",
} as const;
/**
 * Oturumlu üyenin karşılığı. `sellerSite` YOK: üye ürün sayfası satıcının
 * sitesini göstermez, üyeye o satır hiç çizilmez (`SellerSiteGate` ile aynı).
 */
const MEMBER_SENTENCE_KEY: Record<GatedSentence, "panelForContact" | null> = {
  sellerSite: null,
  contact: "panelForContact",
};
export type GatedSentence = keyof typeof SENTENCE_KEY;

/**
 * KAPILI ALAN — gizlenen değerin YERİNE basılır (görünürlük katmanı).
 *
 * Bulanıklaştırma YOK: bulanık değer "orada ama görmüyorsun" der ve
 * ziyaretçi CSS'i kaldırıp okumayı dener; biz değeri HTML'e hiç yazmıyoruz.
 * Kısa metin + giriş bağlantısı, giriş sonrası ilgili panel sayfasına düşer.
 *
 * İki boy: `inline` (satır içi, sayfada istendiği kadar) ve `box` (büyük
 * kayıt kutusu, sayfa başına EN FAZLA BİR).
 *
 * OTURUMLU ÜYEYE GİRİŞ/KAYIT DENMEZ (arayüz testi kapanış S-PUB-ADMIN): sayfa
 * statik/ISR, kutu eskiden oturuma bakmıyordu — header "Panele git" derken
 * firma profili üyeye "Kayıt ücretsiz… Giriş yapın · Ücretsiz kaydolun"
 * basıyordu. Hidrasyondan sonra üyeye aynı alan PANEL karşılığıyla çizilir
 * (`redirect`e doğrudan bağlantı, `memberHint`); panel karşılığı yoksa
 * (`redirect` yok ya da `sellerSite`) hiç çizilmez. Sunucu HTML'i her zaman
 * misafir hâlidir (SEO ve #418 güvenli; `SessionSwap` ile aynı desen).
 */
export function GatedField({
  label,
  redirect,
  signup,
  size = "inline",
  title,
  hint,
  memberHint,
  sentence,
  className,
}: {
  /** "Fiyat", "Kalem listesi", "Değerlendirmeler" — cümle: "{label} için giriş yapın". */
  label: string;
  /** Giriş sonrası düşülecek panel yolu. */
  redirect?: string;
  /**
   * Box'taki kayıt bağlantısı (niyet + dönüş, `signupHref`). Verilmezse
   * kayıt da `redirect`e döner — eskiden çıplak `/company/kayit`ti, niyet ve
   * dönüş adresi kayboluyordu (arayüz testi D-332).
   */
  signup?: string;
  size?: "inline" | "box";
  /**
   * Box başlığı — verilmezse "{label} üyelere açık". Üyelikle DEĞİL paketle
   * açılan alan (talep detayında alıcı/şartname → Silver) kendi başlığını
   * verir; genel kalıp ücretsiz kaydın açtığını vaat ediyordu (arayüz testi
   * kapanış COPY, T-02).
   */
  title?: string;
  /** Box: ikinci satır açıklama (misafire — kayıt/paket metni). */
  hint?: string;
  /** Box: oturumlu üyeye ikinci satır (verilmezse yok; misafir `hint`i üyeye gösterilmez). */
  memberHint?: string;
  /** Inline: genel kalıp yerine alanın kendi cümlesi (`<link>` taşır). */
  sentence?: GatedSentence;
  className?: string;
}) {
  const t = useTranslations("web.marketplace.gated");
  const member = useSignedIn();
  const href = member && redirect ? redirect : loginHref(redirect);
  const link = (chunks: React.ReactNode) => (
    <Link href={href} className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950">
      {chunks}
    </Link>
  );
  if (member) {
    if (!redirect) return null;
    if (size === "box") {
      return (
        <div className={`rounded-2xl border border-zinc-200 bg-zinc-50/60 px-5 py-5 ${className ?? ""}`}>
          <p className="text-sm font-semibold text-zinc-900">{t("inPanel", { label })}</p>
          {memberHint ? <p className="mt-1 text-sm/6 text-zinc-600">{memberHint}</p> : null}
          <div className="mt-3 text-sm">
            <AccentLink href={redirect} className="inline-block rounded-full px-4 py-1.5 font-semibold text-white transition">
              {t("openInPanel")}
            </AccentLink>
          </div>
        </div>
      );
    }
    const key = sentence ? MEMBER_SENTENCE_KEY[sentence] : "panelFor";
    if (!key) return null;
    return (
      <span className={`inline-flex items-center gap-1.5 text-sm text-zinc-500 ${className ?? ""}`}>
        <span>{key === "panelFor" ? t.rich("panelFor", { label, link }) : t.rich(key, { link })}</span>
      </span>
    );
  }
  if (size === "box") {
    return (
      <div
        className={`rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-5 py-5 ${className ?? ""}`}
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <LockClosedIcon aria-hidden className="size-4 text-zinc-400" />
          {title ?? t("membersOnly", { label })}
        </p>
        {hint ? <p className="mt-1 text-sm/6 text-zinc-600">{hint}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <AccentLink
            href={href}
            className="rounded-full px-4 py-1.5 font-semibold text-white transition"
          >
            {t("login")}
          </AccentLink>
          <Link href={signup ?? signupHref(undefined, redirect)} className="font-medium text-zinc-700 hover:underline">
            {t("signup")}
          </Link>
        </div>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-zinc-500 ${className ?? ""}`}>
      <LockClosedIcon aria-hidden className="size-3.5 text-zinc-400" />
      <span>
        {sentence
          ? t.rich(SENTENCE_KEY[sentence], { link })
          : t.rich("loginFor", { label, link })}
      </span>
    </span>
  );
}

/** Oturum var mı — hidrasyondan sonra (öncesi ve sunucuda `false`). */
function useSignedIn(): boolean {
  const hydrated = useHydrated();
  const storeHydrated = useCompanyAuthStore((s) => s.isHydrated);
  const user = useCompanyAuthStore((s) => s.user);
  return hydrated && storeHydrated && !!user;
}

/** Kart içinde (zaten bir <a> içindeyken) bağlantısız metin. */
export function GatedText({ label }: { label: string }) {
  const t = useTranslations("web.marketplace.gated");
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500">
      <LockClosedIcon aria-hidden className="size-3.5 text-zinc-400" />
      {t("loginForText", { label })}
    </span>
  );
}
