"use client";

import { Heading } from "@/components/catalyst/heading";
import { Text } from "@/components/catalyst/text";

export function ComingSoon({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <Heading>{title}</Heading>
      <section className="rounded-xl border border-dashed border-zinc-300 bg-zinc-50/50 p-10 text-center">
        <Text className="text-sm text-zinc-500">{description}</Text>
        <Text className="mt-2 text-xs text-zinc-400">Yakında</Text>
      </section>
    </div>
  );
}
