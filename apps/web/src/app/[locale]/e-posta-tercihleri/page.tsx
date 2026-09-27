"use client";

import { api } from "@/lib/api";
import { localizePath } from "@/i18n/href";
import { Link } from "@/i18n/navigation";
import { isLocale } from "@rothern/i18n";
import { CheckCircle2, Loader2, MailX, XCircle } from "lucide-react";
import { useLocale, useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState, type ReactNode } from "react";

/**
 * E-POSTA TERCİHLERİ / TEK TIK ÇIKIŞ SAYFASI (2026-09-27) — e-postanın alt
 * bilgisindeki "abonelikten çıkın" bağlantısı buraya düşer.
 *
 * Sayfa açılışı HİÇBİR ŞEY DEĞİŞTİRMEZ (kurumsal güvenlik tarayıcıları
 * bağlantıyı önceden açar; açılışta çıkış yapılsaydı alıcı hiç istemeden
 * abonelikten düşerdi) — çıkış düğmeyle. Jeton şifrelidir; kapsam, maskeli
 * adres ve e-postanın dili API'den okunur. Dil adresteki dilden farklıysa
 * aynı sayfa doğru ön ekle açılır.
 */
type Scope =
  | "invitation"
  | "reminder"
  | "bidElimination"
  | "listingClosed"
  | "categoryMatch"
  | "approvalPending"
  | "announcement"
  | "aiSuggestions"
  | "invite"
  | "lifecycle"
  | "all";

interface Described {
  scope: Scope;
  email: string;
  locale: string;
  unsubscribed: boolean;
}

type State =
  | { kind: "loading" }
  | { kind: "ready"; data: Described }
  | { kind: "done"; scope: Scope }
  | { kind: "invalid" };

function Card({ children }: { children: ReactNode }) {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-100 px-4">
      <div className="w-full max-w-md rounded-2xl border border-zinc-200 bg-white p-8 text-center shadow-sm">
        {children}
      </div>
    </main>
  );
}

function EmailPrefsInner() {
  const t = useTranslations("web.marketing.emailPrefs");
  const locale = useLocale();
  const token = useSearchParams().get("t") ?? "";
  const [state, setState] = useState<State>({ kind: "loading" });
  const [busy, setBusy] = useState<"one" | "all" | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    api
      .get<Described>("/public/email/unsubscribe", { params: { t: token } })
      .then(({ data }) => {
        if (cancelled) return;
        if (isLocale(data.locale) && data.locale !== locale) {
          window.location.replace(`${localizePath("/e-posta-tercihleri", data.locale)}${window.location.search}`);
          return;
        }
        setState(data.unsubscribed ? { kind: "done", scope: data.scope } : { kind: "ready", data });
      })
      .catch(() => {
        if (!cancelled) setState({ kind: "invalid" });
      });
    return () => {
      cancelled = true;
    };
  }, [token, locale]);

  const scopeLabel = (s: Scope) => t(`scope.${s}`);
  const manage = (
    <p className="mt-6 text-xs text-zinc-600">
      {t.rich("manage", {
        link: (c) => (
          <Link href="/company/ayarlar/bildirimler" className="font-medium text-zinc-900 underline">
            {c}
          </Link>
        ),
      })}
    </p>
  );

  async function submit(all: boolean) {
    setBusy(all ? "all" : "one");
    setFailed(false);
    try {
      const { data } = await api.post<{ scope: Scope }>("/public/email/unsubscribe", { t: token, all });
      setState({ kind: "done", scope: data.scope });
    } catch {
      setFailed(true);
    } finally {
      setBusy(null);
    }
  }

  if (state.kind === "loading") {
    return (
      <Card>
        <Loader2 className="mx-auto h-8 w-8 animate-spin text-zinc-500" aria-hidden />
        <p className="mt-4 text-sm text-zinc-600">{t("loading")}</p>
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
        <CheckCircle2 className="mx-auto h-10 w-10 text-emerald-600" aria-hidden />
        <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("doneTitle")}</h1>
        <p className="mt-2 text-sm text-zinc-600">{t("doneBody", { scope: scopeLabel(state.scope) })}</p>
        {manage}
      </Card>
    );
  }

  const { data } = state;
  return (
    <Card>
      <MailX className="mx-auto h-10 w-10 text-zinc-700" aria-hidden />
      <h1 className="mt-4 text-lg font-semibold text-zinc-900">{t("title")}</h1>
      <p className="mt-1 text-sm text-zinc-600">{t("forAddress", { email: data.email })}</p>
      <p className="mt-5 text-sm text-zinc-800">{t("question")}</p>
      <p className="mt-1 text-sm text-zinc-700">
        {t.rich("scopeLine", { scope: scopeLabel(data.scope), b: (c) => <strong>{c}</strong> })}
      </p>
      <div className="mt-6 flex flex-col gap-2">
        <button
          type="button"
          onClick={() => void submit(false)}
          disabled={busy !== null}
          className="inline-flex w-full items-center justify-center gap-2 rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
        >
          {busy === "one" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
          {t("confirm")}
        </button>
        {data.scope !== "all" ? (
          <button
            type="button"
            onClick={() => void submit(true)}
            disabled={busy !== null}
            className="inline-flex w-full items-center justify-center gap-2 rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-100 disabled:opacity-50"
          >
            {busy === "all" ? <Loader2 className="h-4 w-4 animate-spin" aria-hidden /> : null}
            {t("confirmAll")}
          </button>
        ) : null}
      </div>
      {failed ? (
        <p role="alert" className="mt-3 text-sm text-rose-700">
          {t("error")}
        </p>
      ) : null}
      <p className="mt-5 text-xs text-zinc-600">{t("transactionalNote")}</p>
      {manage}
    </Card>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <EmailPrefsInner />
    </Suspense>
  );
}
