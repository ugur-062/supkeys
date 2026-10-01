import { useTranslations } from "next-intl";
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
 */
export function GatedField({
  label,
  redirect,
  signup,
  size = "inline",
  hint,
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
  /** Box: ikinci satır açıklama. */
  hint?: string;
  /** Inline: genel kalıp yerine alanın kendi cümlesi (`<link>` taşır). */
  sentence?: GatedSentence;
  className?: string;
}) {
  const t = useTranslations("web.marketplace.gated");
  const href = loginHref(redirect);
  const link = (chunks: React.ReactNode) => (
    <Link href={href} className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950">
      {chunks}
    </Link>
  );
  if (size === "box") {
    return (
      <div
        className={`rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-5 py-5 ${className ?? ""}`}
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <LockClosedIcon aria-hidden className="size-4 text-zinc-400" />
          {t("membersOnly", { label })}
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
