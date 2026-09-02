import { EmptyListings } from "./listing-card";
import { ArrowRightIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import type { ReactNode } from "react";

/**
 * Anasayfadaki "son kayıtlar" bölümü — İLAN ve ÜRÜN bölümleri ORTAK kullanır.
 *
 * Kartları `cards` olarak alır (kendi tipini bilmez): ilan kartı ile ürün
 * kartı farklı veri taşır ama bölüm ÇERÇEVESİ aynı olmalı. İki ayrı bölüm
 * bileşeni yazılsaydı biri "tümünü gör" bağlantısını başka yere koyar, öteki
 * boş durumu farklı gösterirdi ve anasayfa iki farklı ritim konuşurdu.
 *
 * Envanter azken ızgara BOŞ HÜCRE bırakmasın diye sütun sayısı içerik
 * sayısıyla sınırlanır: tek kayıt tek sütunda, iki kayıt iki sütunda durur.
 * Sabit `lg:grid-cols-3` bıraksaydık tek kart üçte birlik bir şeridin
 * solunda öksüz kalır ve sayfa "yüklenememiş" gibi okunurdu.
 */
export function SectionGrid({
  heading,
  lead,
  href,
  hrefLabel,
  cards,
  emptyTitle,
  emptyHint,
  emptyAction,
}: {
  heading: string;
  lead: string;
  href: string;
  hrefLabel: string;
  cards: ReactNode[];
  emptyTitle: string;
  emptyHint?: string;
  emptyAction?: { label: string; href: string };
}) {
  const cols =
    cards.length >= 3
      ? "sm:grid-cols-2 lg:grid-cols-3"
      : cards.length === 2
        ? "sm:grid-cols-2"
        : "sm:max-w-sm";

  return (
    <section className="mx-auto max-w-7xl px-6 py-16 lg:px-8">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h2 className="text-2xl font-semibold tracking-tight text-zinc-950 sm:text-3xl">
            {heading}
          </h2>
          <p className="mt-2 max-w-2xl text-base/7 text-zinc-500">{lead}</p>
        </div>
        {cards.length > 0 ? (
          <Link
            href={href}
            className="inline-flex items-center gap-1 rounded-full border border-zinc-300 px-4 py-2 text-sm font-semibold text-zinc-900 transition hover:bg-zinc-950 hover:text-white"
          >
            {hrefLabel}
            <ArrowRightIcon aria-hidden className="size-4" />
          </Link>
        ) : null}
      </div>
      <div className="mt-8">
        {cards.length === 0 ? (
          <EmptyListings
            title={emptyTitle}
            hint={emptyHint}
            action={emptyAction}
          />
        ) : (
          <div className={`grid grid-cols-1 gap-5 ${cols}`}>{cards}</div>
        )}
      </div>
    </section>
  );
}
