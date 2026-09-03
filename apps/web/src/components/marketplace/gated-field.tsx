import { loginHref } from "@/lib/public/visibility";
import { LockClosedIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

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
  size = "inline",
  hint,
  className,
}: {
  /** "Fiyat", "Kalem listesi", "Değerlendirmeler" — cümle: "{label} için giriş yapın". */
  label: string;
  /** Giriş sonrası düşülecek panel yolu. */
  redirect?: string;
  size?: "inline" | "box";
  /** Box: ikinci satır açıklama. */
  hint?: string;
  className?: string;
}) {
  const href = loginHref(redirect);
  if (size === "box") {
    return (
      <div
        className={`rounded-2xl border border-dashed border-zinc-300 bg-zinc-50/60 px-5 py-5 ${className ?? ""}`}
      >
        <p className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <LockClosedIcon aria-hidden className="size-4 text-zinc-400" />
          {label} üyelere açık
        </p>
        {hint ? <p className="mt-1 text-sm/6 text-zinc-600">{hint}</p> : null}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-sm">
          <Link
            href={href}
            className="rounded-full bg-zinc-950 px-4 py-1.5 font-semibold text-white transition hover:bg-zinc-800"
          >
            Giriş yapın
          </Link>
          <Link href="/company/kayit" className="font-medium text-zinc-700 hover:underline">
            Ücretsiz kaydolun
          </Link>
        </div>
      </div>
    );
  }
  return (
    <span className={`inline-flex items-center gap-1.5 text-sm text-zinc-500 ${className ?? ""}`}>
      <LockClosedIcon aria-hidden className="size-3.5 text-zinc-400" />
      <span>
        {label} için{" "}
        <Link href={href} className="font-medium text-zinc-800 underline underline-offset-2 hover:text-zinc-950">
          giriş yapın
        </Link>
      </span>
    </span>
  );
}

/** Kart içinde (zaten bir <a> içindeyken) bağlantısız metin. */
export function GatedText({ label }: { label: string }) {
  return (
    <span className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500">
      <LockClosedIcon aria-hidden className="size-3.5 text-zinc-400" />
      {label} için giriş yapın
    </span>
  );
}
