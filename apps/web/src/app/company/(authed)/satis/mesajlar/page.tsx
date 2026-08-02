"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect } from "react";

/** Eski portal-ayrı kutu → birleşik kutuya yönlendirme (parametre korunur). */
function Redirector() {
  const router = useRouter();
  const params = useSearchParams();
  useEffect(() => {
    const withId = params.get("with");
    const q = new URLSearchParams({ portal: "satis" });
    if (withId) q.set("with", withId);
    router.replace(`/company/mesajlar?${q.toString()}`);
  }, [router, params]);
  return null;
}

export default function SatisMesajlarPage() {
  return (
    <Suspense fallback={null}>
      <Redirector />
    </Suspense>
  );
}
