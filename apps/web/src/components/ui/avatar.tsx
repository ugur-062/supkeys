import { AVATAR_PASTELS, avatarHash, avatarInitials } from "@/lib/avatar-utils";
import { cn } from "@/lib/utils";

/**
 * AVATAR / FİRMA LOGOSU — `src` varsa görsel, yoksa MONOGRAM (ilk iki
 * kelimenin baş harfi, TR büyük harf) ve ad hash'inden 8 pastelden biri
 * (deterministik: aynı firma her yerde aynı renk). KARE köşe (`rounded-md`):
 * firma logoları kare dilidir, yuvarlak kişi avatarı değil. Boyut px.
 */
const SIZE: Record<24 | 32 | 48 | 64 | 96, string> = {
  24: "size-6 text-[10px] rounded",
  32: "size-8 text-xs rounded-md",
  48: "size-12 text-base rounded-md",
  64: "size-16 text-xl rounded-lg",
  96: "size-24 text-3xl rounded-xl",
};

export function Avatar({
  name,
  src,
  size = 32,
  className,
}: {
  name: string;
  src?: string | null;
  size?: keyof typeof SIZE;
  className?: string;
}) {
  const pastel = AVATAR_PASTELS[avatarHash(name) % AVATAR_PASTELS.length]!;
  if (src) {
    return (
      // eslint-disable-next-line @next/next/no-img-element -- logo host'ları sınırsız; next/image bilinmeyen host'u reddeder
      <img
        src={src}
        alt={name}
        width={size}
        height={size}
        loading="lazy"
        className={cn("shrink-0 bg-white object-contain ring-1 ring-zinc-950/10", SIZE[size], className)}
      />
    );
  }
  return (
    <span
      role="img"
      aria-label={name}
      title={name}
      className={cn(
        "inline-flex shrink-0 select-none items-center justify-center font-semibold ring-1 ring-zinc-950/5",
        pastel.bg,
        pastel.text,
        SIZE[size],
        className,
      )}
    >
      {avatarInitials(name)}
    </span>
  );
}
