import { cn } from "@/lib/utils";
import { SupkeysLogo, type LogoSize, type LogoVariant } from "./supkeys-logo";

interface AdminLogoProps {
  className?: string;
  /**
   * Sidebar (koyu zemin) için "light" → beyaz logo,
   * Login (açık zemin) için "dark" → renkli logo.
   */
  variant?: "light" | "dark";
  /** Sıkışık yerlerde sadece S kutusu */
  iconOnly?: boolean;
  /** Boyut — varsayılan md */
  size?: LogoSize;
  /** "ADMIN" rozeti */
  badge?: boolean;
  /** LCP optimization — login gibi anasayfalarda true geçilmeli */
  priority?: boolean;
}

export function AdminLogo({
  className,
  variant = "dark",
  iconOnly = false,
  size = "md",
  badge = true,
  priority = false,
}: AdminLogoProps) {
  let logoVariant: LogoVariant;
  if (iconOnly) {
    logoVariant = variant === "light" ? "icon-white" : "icon";
  } else {
    logoVariant = variant === "light" ? "full-white" : "full";
  }

  return (
    <div className={cn("flex items-center gap-2.5", className)}>
      <SupkeysLogo variant={logoVariant} size={size} priority={priority} />
      {badge && !iconOnly && (
        <span className="ml-1 admin-pill-danger">Admin</span>
      )}
    </div>
  );
}
