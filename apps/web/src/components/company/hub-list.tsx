"use client";

import { PageContainer } from "@/components/list/page-container";
import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ChevronRight, Lock, type LucideIcon } from "lucide-react";
import { Link } from "@/i18n/navigation";
import type { ReactNode } from "react";

export interface HubItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
  /**
   * Paket kilidi rozeti (ör. "Gold ile açılır"): kişinin izni var ama paketi
   * yetmiyor — kart görünür, tıklayınca hedef sayfanın paket kapısı açılır.
   */
  lockedLabel?: string;
}

/**
 * Ön-seçim hub'ı (eski sistem deseni): başlık + tıklanabilir kart listesi.
 * Raporlar ve Şablonlar giriş sayfaları bunun üzerine kurulur.
 */
export function HubList({
  title,
  description,
  items,
  empty,
}: {
  title: string;
  description: string;
  items: HubItem[];
  /** Liste boşken çizilecek boş durum (boş sayfa kalmasın). */
  empty?: ReactNode;
}) {
  return (
    // B13: hub sayfaları da veri sayfaları gibi TAM genişlik — Raporlar'da
    // hub dar / grafikler geniş tutarsızlığı buradan geliyordu.
    <PageContainer className="space-y-6">
      <div>
        <Heading>{title}</Heading>
        <Text className="mt-1 text-sm text-zinc-500">{description}</Text>
      </div>
      {items.length === 0 && empty ? empty : null}
      <ul className="space-y-3">
        {items.map((it) => (
          <li key={it.href}>
            <Link
              href={it.href}
              className="group flex items-center gap-4 card p-5 shadow-sm transition-all hover:border-zinc-300 hover:shadow-md"
            >
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-zinc-100 transition-colors group-hover:bg-zinc-900">
                <it.icon className="h-5 w-5 text-zinc-700 transition-colors group-hover:text-white" />
              </div>
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-2 font-semibold text-zinc-900">
                  {it.label}
                  {it.lockedLabel ? (
                    <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-800 ring-1 ring-amber-200">
                      <Lock className="size-3" aria-hidden />
                      {it.lockedLabel}
                    </span>
                  ) : null}
                </p>
                <p className="mt-0.5 text-xs text-zinc-500">{it.description}</p>
              </div>
              <ChevronRight
                className="h-4 w-4 shrink-0 text-zinc-400 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-900"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </PageContainer>
  );
}
