import { cn } from "@/lib/utils";
import type { HTMLAttributes } from "react";

/* Taban `HTMLElement`: aynı bileşen hem <label> hem <p> basıyor, olay
   işleyicileri ikisine de atanabilmeli. `htmlFor` ayrıca bildirilir. */
interface LabelProps extends HTMLAttributes<HTMLElement> {
  required?: boolean;
  htmlFor?: string;
  /**
   * Tek bir kontrolü etiketlemiyorsa `"p"` ver.
   *
   * NEDEN: `<label>` bir kontrola BAĞLI DEĞİLSE erişilebilirlik ihlalidir —
   * ekran okuyucu onu alan adı sanar ama odaklanacak bir alan bulamaz. Bir
   * kutu grubunu, çip listesini, kendi adını taşıyan bir düğmeyi ya da zaten
   * kendi `<label>`ının içinde sarılı bir dosya girişini etiketlerken
   * `as="p"` kullan. Görünüm birebir aynı kalır.
   *
   * Catalyst tarafında aynı kural zaten uygulanıyor (grup etiketi düz `<p id>`).
   */
  as?: "label" | "p";
}

export function Label({ children, required, className, as = "label", ...props }: LabelProps) {
  const sinif = cn("block text-sm/6 font-medium text-zinc-950 mb-1.5", className);
  const govde = (
    <>
      {children}
      {required && (
        <span aria-hidden="true" className="text-danger-500 ml-0.5">
          *
        </span>
      )}
    </>
  );

  if (as === "p") {
    // `htmlFor` paragrafta ANLAMSIZ — tip düzeyinde de düşürülür ki yanlışlıkla
    // verilip "bağladım" sanılmasın.
    const { htmlFor: _kullanilmaz, ...paragrafProps } = props;
    return (
      <p className={sinif} {...paragrafProps}>
        {govde}
      </p>
    );
  }

  return (
    <label className={sinif} {...props}>
      {govde}
    </label>
  );
}
