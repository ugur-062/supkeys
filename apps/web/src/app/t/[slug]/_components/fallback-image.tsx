"use client";

/**
 * V2-PUBLIC-PROFILE — Server Component sayfasında event handler kullanabilmek
 * için ayrılmış küçük Client Component.
 *
 * R2 public erişim aktif değilse / dosya silindiyse img yüklenmez —
 * placeholder göster (broken image yerine).
 */
export function FallbackImage({
  src,
  alt,
  className,
}: {
  src: string;
  alt: string;
  className?: string;
}) {
  return (
    // eslint-disable-next-line @next/next/no-img-element
    <img
      src={src}
      alt={alt}
      className={className}
      loading="lazy"
      onError={(e) => {
        const img = e.currentTarget;
        img.style.display = "none";
        const parent = img.parentElement;
        if (parent && !parent.querySelector("[data-broken]")) {
          const div = document.createElement("div");
          div.setAttribute("data-broken", "true");
          div.className =
            "absolute inset-0 flex items-center justify-center text-slate-400 text-xs";
          div.textContent = "Görsel yüklenemedi";
          parent.appendChild(div);
        }
      }}
    />
  );
}
