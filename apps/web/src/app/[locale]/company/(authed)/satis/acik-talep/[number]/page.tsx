"use client";

import { useParams } from "next/navigation";
import { MaskedRequestView } from "@/components/company/masked-request-view";

/**
 * Ücretsiz üyenin ALICI GİZLİ talep görünümü (2026-10-03) — Açık Talepler'deki
 * maskeli satırın hedefi. Numarayla açılır (iç kimlik ücretsiz üyeye verilmez);
 * satış portalı kapısı (`satis/layout.tsx`) ve API `sell:view` geçerli.
 */
export default function MaskedRequestPage() {
  const params = useParams<{ number: string }>();
  return <MaskedRequestView number={decodeURIComponent(params?.number ?? "")} />;
}
