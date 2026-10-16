"use client";

import { cn } from "@/lib/utils";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";

/** Solan kenarın genişliği (px) — maskedeki 2.5rem ile aynı. */
const FADE_PX = 40;

export interface TabItem {
  /** URL hash anahtarı (`#ozellikler`) — hashSync açıkken. */
  id: string;
  label: ReactNode;
  content: ReactNode;
  /** Gizlenmek isteyen sekme (boş veri) — dizinden düşer. */
  hidden?: boolean;
}

/**
 * SEKMELER — Headless UI TabGroup, alt çizgi stili (monokrom: seçili siyah
 * çizgi). Klavye: ← → Home End (Headless). `hashSync` ile seçili sekme
 * `location.hash`e yazılır ve açılışta oradan okunur; sayfa yenilense de
 * sekme korunur (ürün sayfası Açıklama / Özellikler / Firma).
 */
export function Tabs({
  items,
  defaultIndex = 0,
  hashSync = false,
  accent = "default",
  className,
  panelClassName,
}: {
  items: TabItem[];
  defaultIndex?: number;
  hashSync?: boolean;
  /**
   * Seçili sekmenin rengi (2026-09-08, kullanıcı kararı): panelin satınalma
   * bölgesinde MAVİ, herkese açık pazar yerinde monokrom. Renk çağırandan
   * gelir — bileşen hangi portalda olduğunu bilmez.
   */
  accent?: "default" | "blue";
  className?: string;
  panelClassName?: string;
}) {
  const visible = items.filter((t) => !t.hidden);
  const [index, setIndex] = useState(defaultIndex);
  const listRef = useRef<HTMLDivElement>(null);
  // Çapadan seçilen sekmeye kaydırma bekliyor mu (arayüz testi webA-03
  // yeniden doğrulama): `#belgeler` sekmeyi seçiyordu ama sayfa en üstte
  // kalıyordu. Sekme paneli yalnız seçilince bağlanır (Headless `unmount`);
  // tarayıcının çapa kaydırması da `useScrollToHash` da öğeyi henüz
  // bulamıyordu. Kaydırma, seçim işlendikten SONRAKİ efektte yapılır.
  const [scrollToSelected, setScrollToSelected] = useState(false);

  useEffect(() => {
    if (!hashSync) return;
    const fromHash = decodeURIComponent(window.location.hash.slice(1));
    const i = visible.findIndex((t) => t.id === fromHash);
    if (i >= 0) {
      setIndex(i);
      setScrollToSelected(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta
  }, [hashSync]);

  useEffect(() => {
    if (!scrollToSelected) return;
    setScrollToSelected(false);
    // Sekme çubuğu görünsün diye ÇUBUĞA kaydırılır (sabit üst çubuk payı
    // `scroll-mt-*` ile); seçili panel hemen altında.
    listRef.current?.scrollIntoView?.({ block: "start" });
  }, [scrollToSelected, index]);

  /**
   * KAYDIRMA İPUCU (mobil denetim 2026-10 g02): telefonda sekmeler çubuğa
   * sığmıyor (TR 360 px'te 383 px, RU 577 px) ve gizli kaydırma çubuğu
   * yüzünden üçüncü sekmenin varlığı görünmüyordu ("Se", RU'da "Сертификаты"
   * hiç). Taşan yönde kenar yumuşakça solar (maske — zemin rengi bilmez)
   * ve seçilen sekme çubukta tam görünür olacak kadar kaydırılır. Sığan
   * çubukta (masaüstü) ikisi de devreye girmez.
   */
  const [overflow, setOverflow] = useState<{ start: boolean; end: boolean }>({ start: false, end: false });
  const measure = useCallback(() => {
    const el = listRef.current;
    if (!el) return;
    const max = el.scrollWidth - el.clientWidth;
    const next = { start: max > 1 && el.scrollLeft > 1, end: max > 1 && el.scrollLeft < max - 1 };
    setOverflow((prev) => (prev.start === next.start && prev.end === next.end ? prev : next));
  }, []);
  useEffect(() => {
    const el = listRef.current;
    if (!el) return;
    measure();
    el.addEventListener("scroll", measure, { passive: true });
    const ro = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(measure);
    ro?.observe(el);
    // Sekmeler de izlenir: çubuğun boyu değişmeden içerik genişleyebilir
    // (seçilen sekme kalınlaşır, yazı tipi sonradan yüklenir).
    for (const tab of Array.from(el.children)) ro?.observe(tab);
    return () => {
      el.removeEventListener("scroll", measure);
      ro?.disconnect();
    };
  }, [measure, visible.length]);

  // Seçilen sekme kısmen görünüyorsa çubuk yatayda kaydırılır (sayfa dikeyde
  // OYNAMAZ — `scrollIntoView` kullanılmaz). Solan kenar payı kadar içeri.
  useEffect(() => {
    const el = listRef.current;
    // Seçili sekme dizinden (Headless `aria-selected`i bir sonraki çizimde
    // yazabilir; o an eski sekme seçili görünür).
    const tab = el?.querySelectorAll<HTMLElement>('[role="tab"]')[Math.min(index, visible.length - 1)];
    if (!el || !tab || el.scrollWidth <= el.clientWidth) return;
    const list = el.getBoundingClientRect();
    const box = tab.getBoundingClientRect();
    let next = el.scrollLeft;
    if (box.left < list.left + FADE_PX) next -= list.left + FADE_PX - box.left;
    else if (box.right > list.right - FADE_PX) next += box.right - (list.right - FADE_PX);
    next = Math.max(0, Math.min(el.scrollWidth - el.clientWidth, next));
    if (next !== el.scrollLeft) el.scrollLeft = next;
  }, [index, visible.length]);

  const onChange = (i: number) => {
    setIndex(i);
    if (hashSync && visible[i]) {
      window.history.replaceState(null, "", `#${visible[i].id}`);
    }
  };

  return (
    <TabGroup selectedIndex={Math.min(index, Math.max(0, visible.length - 1))} onChange={onChange} className={className}>
      {/* Sekme çubuğu (2026-09-08): seçili sekme KALIN + renkli alt çizgi,
          seçili olmayanlarda hover'da yumuşak zemin. Eskiden hepsi aynı
          ağırlıkta gri metindi ve çubuk "düz" duruyordu. */}
      <TabList
        ref={listRef}
        className={cn(
          "flex scroll-mt-28 gap-1 overflow-x-auto overscroll-x-contain border-b border-zinc-200 [scrollbar-width:none]",
          overflow.start && overflow.end
            ? "[mask-image:linear-gradient(to_right,transparent,white_2.5rem,white_calc(100%_-_2.5rem),transparent)]"
            : overflow.end
              ? "[mask-image:linear-gradient(to_right,white_calc(100%_-_2.5rem),transparent)]"
              : overflow.start
                ? "[mask-image:linear-gradient(to_right,transparent,white_2.5rem)]"
                : null,
        )}
        data-overflow-start={overflow.start || undefined}
        data-overflow-end={overflow.end || undefined}
      >
        {visible.map((t) => (
          <Tab
            key={t.id}
            className={cn(
              "-mb-px shrink-0 rounded-t-lg border-b-2 border-transparent px-3 py-3 text-sm font-medium text-zinc-500 outline-none transition",
              "hover:bg-zinc-50 data-[selected]:font-semibold",
              accent === "blue"
                ? "hover:text-blue-700 data-[selected]:border-blue-600 data-[selected]:text-blue-700 data-[focus]:outline-blue-600"
                : "hover:text-zinc-900 data-[selected]:border-zinc-950 data-[selected]:text-zinc-950 data-[focus]:outline-zinc-950",
              "data-[focus]:rounded-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2",
            )}
          >
            {t.label}
          </Tab>
        ))}
      </TabList>
      <TabPanels className={cn("pt-6", panelClassName)}>
        {visible.map((t) => (
          <TabPanel key={t.id} id={t.id} className="outline-none">
            {t.content}
          </TabPanel>
        ))}
      </TabPanels>
    </TabGroup>
  );
}
