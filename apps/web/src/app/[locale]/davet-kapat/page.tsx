"use client";

import { api } from "@/lib/api";
import { CheckCircle2, Loader2, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * Faz C — dış davet opt-out sayfası (public): e-postadaki tek tık link.
 * API'ye token'ı iletir; bu adrese bir daha davet e-postası gönderilmez.
 */
function OptOutInner() {
  const t = useTranslations("web.marketing.optOut");
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
            <p className="mt-4 text-sm text-zinc-600">{t("processing")}</p>
          </>
        ) : state === "ok" ? (
          <>
            <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" />
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">
              {t("doneTitle")}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{t("doneBody")}</p>
          </>
        ) : (
          <>
            <XCircle className="mx-auto h-10 w-10 text-rose-500" />
            <h1 className="mt-4 text-lg font-semibold text-zinc-900">
              {t("invalidTitle")}
            </h1>
            <p className="mt-2 text-sm text-zinc-600">{t("invalidBody")}</p>
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
