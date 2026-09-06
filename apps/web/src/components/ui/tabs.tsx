"use client";

import { cn } from "@/lib/utils";
import { Tab, TabGroup, TabList, TabPanel, TabPanels } from "@headlessui/react";
import { useEffect, useState, type ReactNode } from "react";

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
  className,
  panelClassName,
}: {
  items: TabItem[];
  defaultIndex?: number;
  hashSync?: boolean;
  className?: string;
  panelClassName?: string;
}) {
  const visible = items.filter((t) => !t.hidden);
  const [index, setIndex] = useState(defaultIndex);

  useEffect(() => {
    if (!hashSync) return;
    const fromHash = window.location.hash.slice(1);
    const i = visible.findIndex((t) => t.id === fromHash);
    if (i >= 0) setIndex(i);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- yalnız açılışta
  }, [hashSync]);

  const onChange = (i: number) => {
    setIndex(i);
    if (hashSync && visible[i]) {
      window.history.replaceState(null, "", `#${visible[i].id}`);
    }
  };

  return (
    <TabGroup selectedIndex={Math.min(index, Math.max(0, visible.length - 1))} onChange={onChange} className={className}>
      <TabList className="flex gap-6 overflow-x-auto border-b border-zinc-200 [scrollbar-width:none]">
        {visible.map((t) => (
          <Tab
            key={t.id}
            className={cn(
              "-mb-px shrink-0 border-b-2 border-transparent px-1 py-3 text-sm font-medium text-zinc-500 outline-none transition",
              "hover:text-zinc-900 data-[selected]:border-zinc-950 data-[selected]:text-zinc-950",
              "data-[focus]:rounded-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-zinc-950",
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
