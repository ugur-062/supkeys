"use client";

import { InquiryDialog } from "./inquiry-dialog";
import { useState } from "react";

/**
 * "Teklif iste" düğmesi — sunucu bileşeni olan ürün sayfasındaki tek client
 * adası. Dialog'un kendisi burada tutulur ki sayfa statik/ISR kalabilsin.
 */
export function InquiryButton({
  companySlug,
  productSlug,
  productName,
  companyName,
}: {
  companySlug: string;
  productSlug: string;
  productName: string;
  companyName: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="block w-full rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-zinc-800"
      >
        Teklif iste
      </button>
      <InquiryDialog
        open={open}
        onClose={() => setOpen(false)}
        companySlug={companySlug}
        productSlug={productSlug}
        productName={productName}
        companyName={companyName}
      />
    </>
  );
}
