"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";

/** Onay akışları Onaylar sayfasına taşındı — eski bağlantıyı yönlendir. */
export default function Page() {
  const router = useRouter();
  useEffect(() => {
    router.replace("/company/onaylar");
  }, [router]);
  return (
    <div className="p-8 text-center text-sm text-zinc-400">
      Onay akışları Onaylar sayfasına taşındı — yönlendiriliyorsunuz…
    </div>
  );
}
