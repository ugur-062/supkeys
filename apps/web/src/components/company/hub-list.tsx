"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ArrowRight, type LucideIcon } from "lucide-react";
import Link from "next/link";

export interface HubItem {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
}

/**
 * Ön-seçim hub'ı (eski sistem deseni): başlık + tıklanabilir kart listesi.
 * Raporlar ve Şablonlar giriş sayfaları bunun üzerine kurulur.
 */
export function HubList({
  title,
  description,
  items,
}: {
  title: string;
  description: string;
  items: HubItem[];
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <div>
        <Heading>{title}</Heading>
        <Text className="mt-1 text-sm text-zinc-500">{description}</Text>
      </div>
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
                <p className="font-semibold text-zinc-900">{it.label}</p>
                <p className="mt-0.5 text-xs text-zinc-500">{it.description}</p>
              </div>
              <ArrowRight
                className="h-4 w-4 shrink-0 text-zinc-400 transition-all group-hover:translate-x-0.5 group-hover:text-zinc-900"
                aria-hidden="true"
              />
            </Link>
          </li>
        ))}
      </ul>
    </div>
  );
}
