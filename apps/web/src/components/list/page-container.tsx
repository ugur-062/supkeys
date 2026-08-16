import { cn } from "@/lib/utils";

/**
 * B13 — sayfa genişliği TEK kural: dış sınırı shell'in 1320px konteyneri
 * çizer; sayfalar varsayılan TAM genişliktir. "narrow" yalnız form-ağır
 * yüzeyler (Ayarlar) içindir — sayfa İÇİNDE bölümler farklı genişlikte olamaz.
 */
export function PageContainer({
  width = "full",
  className,
  children,
}: {
  width?: "full" | "narrow";
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <div
      className={cn(
        "w-full",
        width === "narrow" && "mx-auto max-w-3xl",
        className,
      )}
    >
      {children}
    </div>
  );
}
