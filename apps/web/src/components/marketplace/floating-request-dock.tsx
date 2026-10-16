"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

import { useTouchTyping } from "@/components/bids/use-touch-typing";
import { ViewportLayer } from "@/components/ui/viewport-layer";

/**
 * YÜZEN "TALEP AÇ" KÖŞESİ — ürün dizininin sağ-alt köşedeki düğmesi (mobil
 * denetim 2026-10, 2. tur g02 / safe-area).
 *
 * Düğme ekrana sabit; liste sayfasının üstündeki arama satırı ise sayfayla
 * kayar. İki durumda düğme aramanın "Ara" düğmesinin ÜSTÜNE biniyor ve dokunuş
 * kayıt sayfasını açıyordu:
 *  · telefonda arama kutusuna yazarken ekran klavyesi görünüm alanını
 *    kısaltıyor (360×429), arama satırı köşeye iniyordu;
 *  · yatay telefonda (844×390) sayfa başında arama satırı zaten köşede.
 *
 * Kural — düğme GİZLENİR (saydam, dokunulmaz, sekmeyle de erişilmez):
 *  · YAZIM: dokunmatik cihazda klavye açan bir alan odaktayken
 *    (`useTouchTyping`; Android'de geri tuşuyla klavye kapanınca geri gelir);
 *  · ÖRTÜŞME: düğmenin kutusu `[data-float-avoid]` taşıyan bir bölgeyle
 *    (liste sayfasının arama satırı) kesişirken — arama kaydırılıp gidince
 *    düğme geri gelir. Ölçüm kaydırma / boyut değişiminde kare başına bir kez.
 * Gizliyken kutu yerinde kalır (yalnız saydam): ölçüm kendi gizlenişinden
 * etkilenmez, düğme yanıp sönmez.
 *
 * Kutu `ViewportLayer` ile `body`ye taşınır: herkese açık `<main>` bir
 * kapsayıcı (`@container`), eski WebView/Safari'de `fixed` köşe ona göre
 * konumlanıp sayfanın sonuna düşüyordu. Hidrasyon yolunda kutu bir çizim
 * SONRA bağlanır → ölçüm efekti `[]`e değil kutunun kendisine bağlı
 * (geri çağırımlı ref); yoksa ilk ölçüm boş ref görür, kaydırmadan önce
 * örtüşme yakalanmazdı.
 */
export const FLOAT_AVOID_ATTR = "data-float-avoid";

/** Köşedeki kutu, kaçınılacak bir bölgeyle kesişiyor mu? */
export function floatOverlapsAvoid(dock: Element, doc: Document = document): boolean {
  const r = dock.getBoundingClientRect();
  if (r.width <= 0 || r.height <= 0) return false;
  for (const el of Array.from(doc.querySelectorAll(`[${FLOAT_AVOID_ATTR}]`))) {
    const b = el.getBoundingClientRect();
    if (b.width <= 0 || b.height <= 0) continue;
    if (r.left < b.right && r.right > b.left && r.top < b.bottom && r.bottom > b.top) return true;
  }
  return false;
}

export function FloatingRequestDock({
  children,
  className = "",
}: {
  children: ReactNode;
  /** Konum sınıfları (`fixed`, köşe payları, güvenli alan). */
  className?: string;
}) {
  const [dock, setDock] = useState<HTMLDivElement | null>(null);
  // Yazım kuralı sayfanın tamamına bakar (arama kutusu, süzgeç alanları…).
  const pageRef = useRef<HTMLElement | null>(typeof document === "undefined" ? null : document.body);
  const typing = useTouchTyping(pageRef);
  const [overlaps, setOverlaps] = useState(false);

  useEffect(() => {
    pageRef.current = document.body;
    if (!dock) return;
    let raf = 0;
    const measure = () => {
      raf = 0;
      setOverlaps(floatOverlapsAvoid(dock));
    };
    const schedule = () => {
      if (!raf) raf = requestAnimationFrame(measure);
    };
    measure();
    window.addEventListener("scroll", schedule, { passive: true });
    window.addEventListener("resize", schedule);
    const vv = window.visualViewport ?? null;
    vv?.addEventListener("resize", schedule);
    vv?.addEventListener("scroll", schedule);
    // Görsel yüklenince uzayan başlık bandı da arama satırını kaydırır.
    const ro = typeof ResizeObserver !== "undefined" ? new ResizeObserver(schedule) : null;
    ro?.observe(document.body);
    return () => {
      if (raf) cancelAnimationFrame(raf);
      window.removeEventListener("scroll", schedule);
      window.removeEventListener("resize", schedule);
      vv?.removeEventListener("resize", schedule);
      vv?.removeEventListener("scroll", schedule);
      ro?.disconnect();
    };
  }, [dock]);

  const hidden = typing || overlaps;
  return (
    <ViewportLayer>
      <div
        ref={setDock}
        aria-hidden={hidden || undefined}
        inert={hidden || undefined}
        data-float-hidden={hidden ? (typing ? "typing" : "overlap") : undefined}
        className={`${className} transition-opacity duration-200 motion-reduce:transition-none ${
          hidden ? "pointer-events-none opacity-0" : "opacity-100"
        }`}
      >
        {children}
      </div>
    </ViewportLayer>
  );
}
