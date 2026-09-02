/**
 * Koyu bantların ızgara deseni — pazarlama sayfasındaki desenle AYNI teknik.
 *
 * Neden inline `style` + hex DEĞİL: repoda ham renk (hex/rgb) yasağı var
 * (frontend denetimi §2, eslint `no-restricted-syntax`). Renk Tailwind
 * sınıfından (`stroke-white/5`) geliyor, maske arbitrary variant ile.
 *
 * `id` ZORUNLU ve sayfada TEKİL olmalı: aynı sayfada iki desen aynı id'yi
 * taşırsa ikincisi birincinin `<pattern>`ını referanslar ve ölçüsü kayar.
 */
export function GridPattern({
  id,
  className = "[mask-image:radial-gradient(48rem_32rem_at_50%_0%,white,transparent)]",
}: {
  id: string;
  className?: string;
}) {
  return (
    <svg
      aria-hidden="true"
      className={`absolute inset-0 -z-10 size-full stroke-white/[0.07] ${className}`}
    >
      <defs>
        <pattern
          id={id}
          width={64}
          height={64}
          x="50%"
          patternUnits="userSpaceOnUse"
        >
          <path d="M.5 64V.5H64" fill="none" />
        </pattern>
      </defs>
      <rect width="100%" height="100%" strokeWidth={0} fill={`url(#${id})`} />
    </svg>
  );
}
