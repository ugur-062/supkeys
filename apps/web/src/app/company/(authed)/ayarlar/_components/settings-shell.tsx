"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";
import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";

/** Alt-ayarlar sayfası kabuğu — geri linki + başlık + içerik. */
export function SettingsShell({
  title,
  description,
  children,
}: {
  title: string;
  description?: string;
  children: ReactNode;
}) {
  return (
    <div className="mx-auto max-w-3xl space-y-6">
      <Link
        href="/company/ayarlar"
        className="inline-flex items-center gap-1 text-sm text-zinc-500 hover:text-zinc-700"
      >
        <ArrowLeft className="h-4 w-4" />
        Ayarlar
      </Link>
      <div>
        <Heading>{title}</Heading>
        {description ? (
          <Text className="mt-1 text-sm text-zinc-500">{description}</Text>
        ) : null}
      </div>
      {children}
    </div>
  );
}
