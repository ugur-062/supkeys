"use client";

import { cn } from "@/lib/utils";
import { Disclosure as HDisclosure, DisclosureButton, DisclosurePanel } from "@headlessui/react";
import { ChevronDown } from "lucide-react";
import type { ReactNode } from "react";

/**
 * AÇILIR BÖLÜM — başlık + sağda döner ok (Headless Disclosure; klavye ve
 * aria-expanded hazır). Süzgeç grupları, SSS ve mega menü mobil akordeonu.
 * `onChange(open)` dışarıya bildirir (ör. localStorage'a yazmak için).
 */
export function Disclosure({
  title,
  children,
  defaultOpen = false,
  onChange,
  className,
  buttonClassName,
}: {
  title: ReactNode;
  children: ReactNode;
  defaultOpen?: boolean;
  onChange?: (open: boolean) => void;
  className?: string;
  buttonClassName?: string;
}) {
  return (
    <HDisclosure defaultOpen={defaultOpen} as="div" className={className}>
      {({ open }) => (
        <>
          <DisclosureButton
            onClick={() => onChange?.(!open)}
            className={cn(
              "flex w-full items-center justify-between gap-3 py-3 text-left text-sm font-semibold text-zinc-900 outline-none",
              "data-[focus]:rounded-sm data-[focus]:outline data-[focus]:outline-2 data-[focus]:outline-offset-2 data-[focus]:outline-zinc-950",
              buttonClassName,
            )}
          >
            <span className="min-w-0 flex-1">{title}</span>
            <ChevronDown
              aria-hidden
              className={cn("size-4 shrink-0 text-zinc-500 transition-transform motion-reduce:transition-none", open && "rotate-180")}
            />
          </DisclosureButton>
          <DisclosurePanel className="pb-3">{children}</DisclosurePanel>
        </>
      )}
    </HDisclosure>
  );
}
