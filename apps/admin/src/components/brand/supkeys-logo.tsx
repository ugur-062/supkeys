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

const SIZES: Record<
  LogoSize,
  { full: { w: number; h: number }; icon: { w: number; h: number } }
> = {
  sm: { full: { w: 96, h: 24 }, icon: { w: 24, h: 24 } },
  md: { full: { w: 128, h: 32 }, icon: { w: 32, h: 32 } },
  lg: { full: { w: 160, h: 40 }, icon: { w: 40, h: 40 } },
  xl: { full: { w: 200, h: 50 }, icon: { w: 64, h: 64 } },
};

const SOURCES: Record<LogoVariant, string> = {
  full: "/rothern-logo-on-light.png",
  icon: "/rothern-icon.svg",
  "full-white": "/rothern-logo-on-dark.png",
  "icon-white": "/rothern-icon-white-256.png",
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
      className={cn("object-contain", className)}
    />
  );
}
