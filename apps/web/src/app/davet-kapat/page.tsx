"use client";

import { api } from "@/lib/api";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Faz C — dış davet opt-out sayfası (public): e-postadaki tek tık link.
 * API'ye token'ı iletir; bu adrese bir daha davet e-postası gönderilmez.
 */
function OptOutInner() {
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");

  useEffect(() => {
    if (!token) {
      setState("error");
      return;
    }
    api
      .get("/public/referral-optout", { params: { token } })
      .then(() => setState("ok"))
      .catch(() => setState("error"));
  }, [token]);

  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {state === "loading" ? (
          <>
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" />
            <p className="mt-4 text-sm text-zinc-600">İşleniyor…</p>
          </>
        ) : state === "ok" ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">
              Davetler kapatıldı
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Bu e-posta adresine Rothern üzerinden bir daha satın alma talebi daveti
              gönderilmeyecek.
            </p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">
              Bağlantı geçersiz
            </h1>
            <p className="mt-2 text-sm text-zinc-600">
              Bağlantı süresi dolmuş veya hatalı olabilir.
            </p>
          </>
        )}
      </div>
    </main>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OptOutInner />
    </Suspense>
  );
}
