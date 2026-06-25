import { RothernLogo } from "@/components/brand/logo";
import { ArrowLeftIcon } from "@heroicons/react/20/solid";
import Link from "next/link";

export function AuthHeader() {
  return (
    <header className="border-b border-zinc-800 bg-[#0A0A0A]">
      <div className="mx-auto flex max-w-5xl items-center justify-between px-6 py-4">
        <Link
          href="/"
          className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-400 transition hover:text-white"
        >
          <ArrowLeftIcon className="size-4" />
          Anasayfa
        </Link>
        <Link href="/" className="-m-1.5 p-1.5">
          <span className="sr-only">Rothern</span>
          <RothernLogo variant="full" size="md" priority />
        </Link>
        <span className="w-[72px]" aria-hidden="true" />
      </div>
    </header>
  );
}
