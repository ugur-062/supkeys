"use client";

import { CompanyInboxView } from "@/components/messaging/company-inbox-view";
import { Suspense } from "react";

/** Birleşik mesaj kutusu (2026-08-02) — Satınalma + Satış tek sayfada. */
export default function MesajlarPage() {
  // useSearchParams (derin link: ?with=&portal=) Suspense sınırı ister.
  return (
    <Suspense fallback={null}>
      <CompanyInboxView />
    </Suspense>
  );
}
