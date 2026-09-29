"use client";

import { api } from "@/lib/api";
import { CheckCircle2, Loader2, MailX, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * Faz C — dış davet opt-out sayfası (public): davet e-postasındaki "davet
 * almak istemiyorum" bağlantısı buraya düşer.
 *
 * Sayfa açılışı HİÇBİR ŞEY DEĞİŞTİRMEZ (derin denetim MU-17; e-posta
 * tercihleri sayfasıyla aynı desen): kurumsal güvenlik tarayıcıları bağlantıyı
 * JS'li tarayıcıda önceden açar — açılışta çıkış yazılsaydı adres kimse
 * istemeden bütün davetlerden kalıcı düşerdi. Açılışta yalnız jeton okunur
 * (maskeli adres, zaten çıkmış mı); çıkış düğmeyle POST.
 */
interface Described {
  email: string;
  optedOut: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; email: string }
  | { kind: "done" }
  | { kind: "invalid" };

function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  );
}

function OptOutInner() {
  const t = useTranslations("web.marketing.optOut");
  const params = useSearchParams();
  const token = params.get("token") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    api
      .get<Described>("/public/referral-optout", { params: { token } })
      .then(({ data }) => {
        if (!cancelled) setState(data.optedOut ? { kind: "done" } : { kind: "ready", email: data.email });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token]);

  async function confirm() {
    setBusy(true);
    setFailed(false);
    try {
      await api.post("/public/referral-optout", { token });
      setState({ kind: "done" });
    } catch {
      setFailed(true);
    } finally {
      setBusy(false);
    }
  }

  if (state.kind === "loading") {
    return (
      <Card>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-400" aria-hidden />
        <p className="mt-4 text-sm text-zinc-600">{t("processing")}</p>
      </Card>
    );
  }

  if (state.kind === "invalid") {
    return (
      <Card>
        <XCircle className="mx-auto h-10 w-10 text-rose-500" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("invalidTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("invalidBody")}</p>
      </Card>
    );
  }

  if (state.kind === "done") {
    return (
      <Card>
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-500" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("doneTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("doneBody")}</p>
      </Card>
    );
  }

  return (
    <Card>
      <MailX className="mx-auto h-10 w-10 text-zinc-700" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-600">{t("forAddress", { email: state.email })}</p>
      <p className="mt-5 text-sm text-zinc-800">{t("question")}</p>
      <button
        type="button"
        onClick={() => void confirm()}
        disabled={busy}
        className="mt-6 inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
      >
        {busy ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
        {t("confirm")}
      </button>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {t("error")}
        </p>
      ) : null}
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <OptOutInner />
    </Suspense>
  );
}
