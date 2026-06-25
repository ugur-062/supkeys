import { cn } from "@/lib/utils";
import Image from "next/image";

export type LogoVariant = "full" | "icon" | "full-white" | "icon-white";
export type LogoSize = "sm" | "md" | "lg" | "xl";

interface RothernLogoProps {
  variant?: LogoVariant;
  size?: LogoSize;
  className?: string;
  priority?: boolean;
}

// Oran wordmark PNG'ye göre (774:226 ≈ 3.42), ikon 1:1.
const SIZES: Record<
  LogoSize,
  { full: { w: number; h: number }; icon: { w: number; h: number } }
> = {
  sm: { full: { w: 120, h: 35 }, icon: { w: 32, h: 32 } },
  md: { full: { w: 158, h: 46 }, icon: { w: 40, h: 40 } },
  lg: { full: { w: 205, h: 60 }, icon: { w: 52, h: 52 } },
  xl: { full: { w: 274, h: 80 }, icon: { w: 80, h: 80 } },
};

// Asıl logo = "on-dark" koyu kilit (beyaz yazı, kendi koyu zemini). Her yerde
// bu kullanılır — kullanıcının açık/koyu mod tercihinden BAĞIMSIZ.
const SOURCES: Record<LogoVariant, string> = {
  full: "/rothern-logo-on-dark.png",
  icon: "/rothern-icon.svg",
  "full-white": "/rothern-logo-trans-white.png",
  "icon-white": "/rothern-icon-white.svg",
};

export function RothernLogo({
  variant = "full",
  size = "md",
  className,
  priority = false,
}: RothernLogoProps) {
  const isIcon = variant === "icon" || variant === "icon-white";
  const dimensions = isIcon ? SIZES[size].icon : SIZES[size].full;

  return (
    <Image
      src={SOURCES[variant]}
      alt="Rothern"
      width={dimensions.w}
      height={dimensions.h}
      priority={priority}
      unoptimized
      className={cn("object-contain", className)}
    />
  );
}
