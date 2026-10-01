"use client";

import { api } from "@/lib/api";
import { saveInvitePrefill, type InvitePrefill } from "@/lib/company-auth/invite-prefill";
import { Link } from "@/i18n/navigation";
import { useActivityLabel, useQuantityLabel } from "@/i18n/domain";
import { CalendarClock, Loader2, Lock, MapPin, Package, XCircle } from "lucide-react";
import { useTranslations } from "next-intl";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useState } from "react";

/**
 * KAYIT OLMADAN TALEP ÖNİZLEMESİ (2026-09-27, Faz 3). Davet e-postasındaki
 * bağlantı (`?ref=<davet jetonu>&l=<talep>`) buraya düşer: davet eden firma,
 * talep başlığı, kalemler (ad + miktar, en fazla 100; fazlası kayıt sonrası
 * panelde), teslim yeri (şehir + ülke), son
 * tarih — davet e-postasıyla aynı beyaz liste; hedef fiyat, şartname, belge,
 * adres yok. Açılış ilgi sinyali bırakır ve kayıt formu için önceden doldurma
 * bilgisini saklar (bkz. signup-client).
 */
interface Preview {
  listingId: string;
  closed: boolean;
  accepted: boolean;
  inviterName: string;
  tenderTitle: string;
  tenderNumber: string | null;
  categories: string[];
  closesAt: string | null;
  items: Array<{ name: string; quantity: number; unitCode: string | null; unit: string }>;
  itemCount: number;
  deliveryPlace: string | null;
  supplierTypes: string[];
}

function Shell({ children }: { children: React.ReactNode }) {
  return (
    <main className="min-h-screen bg-zinc-100 px-4 py-10">
      <div className="mx-auto w-full max-w-2xl rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">{children}</div>
    </main>
  );
}

function PreviewInner() {
  const t = useTranslations("web.marketing.invitePreview");
  const qty = useQuantityLabel();
  const activity = useActivityLabel();
  const params = useSearchParams();
  const ref = params.get("ref") ?? "";
  const listingParam = params.get("l") ?? "";
  const [state, setState] = useState<{ kind: "loading" } | { kind: "ok"; data: Preview } | { kind: "invalid" }>({
    kind: "loading",
  });

  useEffect(() => {
    if (!ref) {
      setState({ kind: "invalid" });
      return;
    }
    let cancelled = false;
    api
      .get<Preview>("/public/invite-preview", {
        params: { ref, ...(listingParam ? { l: listingParam } : {}) },
        skipErrorToast: true,
      })
      .then(({ data }) => !cancelled && setState({ kind: "ok", data }))
      .catch(() => !cancelled && setState({ kind: "invalid" }));
    // İlgi sinyali + kayıt formu için önceden doldurma (sessiz).
    api
      .post<InvitePrefill>("/public/referral-visit", { token: ref }, { skipErrorToast: true })
      .then(({ data }) => saveInvitePrefill(data))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, [ref, listingParam]);

  if (state.kind === "loading") {
    return (
      <Shell>
        <p className="flex items-center gap-2 text-sm text-zinc-600" role="status">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden />
          {t("loading")}
        </p>
      </Shell>
    );
  }
  if (state.kind === "invalid") {
    return (
      <Shell>
        <XCircle className="h-10 w-10 text-rose-500" aria-hidden />
        <h1 className="mt-3 text-lg font-semibold text-zinc-900">{t("invalidTitle")}</h1>
        <p className="mt-1 text-sm text-zinc-600">{t("invalidBody")}</p>
      </Shell>
    );
  }

  const d = state.data;
  // Kapanmış talepte teklif çağrısı yok ve kapalı talebe dönüş yok (arayüz
  // testi O-117): CTA yalnız "Ücretsiz kaydol" / "Giriş yap", hedef panel.
  const redirect = d.closed ? null : `/company/ilan/${d.listingId}`;
  const signupHref = `/company/kayit?ref=${encodeURIComponent(ref)}${redirect ? `&redirect=${encodeURIComponent(redirect)}` : ""}`;
  const loginHref = redirect ? `/company/login?next=${encodeURIComponent(redirect)}` : "/company/login";
  const ctaLabel = d.accepted
    ? t(d.closed ? "loginClosedCta" : "loginCta")
    : t(d.closed ? "signupClosedCta" : "signupCta");
  const more = Math.max(0, d.itemCount - d.items.length);

  return (
    <Shell>
      <p className="text-xs font-medium tracking-wide text-blue-700 uppercase">Rothern</p>
      <h1 className="mt-1 text-2xl font-semibold text-zinc-950">{t("heading", { inviterName: d.inviterName })}</h1>
      <p className="mt-1 text-sm text-zinc-600">{t("lead")}</p>

      <div className="mt-6 rounded-xl bg-blue-50/60 p-4 ring-1 ring-blue-100">
        <p className="text-lg font-semibold text-zinc-900">{d.tenderTitle}</p>
        {d.tenderNumber ? <p className="mt-0.5 text-xs text-zinc-600">{t("number", { number: d.tenderNumber })}</p> : null}
        <dl className="mt-3 grid grid-cols-1 gap-2 text-sm sm:grid-cols-2">
          {d.closesAt ? (
            <div className="flex items-start gap-1.5">
              {/* Görünen etiket <dt>'nin kendisi — ekran okuyucu bir kez okur (D-337). */}
              <dt className="flex shrink-0 items-start gap-2 text-zinc-600">
                <CalendarClock className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden />
                {t("deadline")}:
              </dt>
              <dd className="text-zinc-800">{d.closesAt}</dd>
            </div>
          ) : null}
          {d.deliveryPlace ? (
            <div className="flex items-start gap-1.5">
              {/* Görünen etiket <dt>'nin kendisi — ekran okuyucu bir kez okur (D-337). */}
              <dt className="flex shrink-0 items-start gap-2 text-zinc-600">
                <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-blue-700" aria-hidden />
                {t("delivery")}:
              </dt>
              <dd className="text-zinc-800">{d.deliveryPlace}</dd>
            </div>
          ) : null}
          {d.categories.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="inline text-zinc-600">{t("categories")}: </dt>
              <dd className="inline text-zinc-800">{d.categories.join(", ")}</dd>
            </div>
          ) : null}
          {d.supplierTypes.length > 0 ? (
            <div className="sm:col-span-2">
              <dt className="inline text-zinc-600">{t("supplierTypes")}: </dt>
              <dd className="inline text-zinc-800">{d.supplierTypes.map(activity).join(", ")}</dd>
            </div>
          ) : null}
        </dl>
      </div>

      {d.items.length > 0 ? (
        <section className="mt-6">
          <h2 className="flex items-center gap-2 text-sm font-semibold text-zinc-900">
            <Package className="h-4 w-4 text-zinc-600" aria-hidden />
            {t("itemsTitle", { n: d.itemCount })}
          </h2>
          <ul className="mt-2 divide-y divide-zinc-100 rounded-xl border border-zinc-200">
            {d.items.map((it, i) => (
              <li key={`${i}-${it.name}`} className="flex items-start justify-between gap-3 px-4 py-2.5 text-sm">
                <span className="min-w-0 break-words text-zinc-900">{it.name}</span>
                <span className="shrink-0 text-zinc-700 tabular-nums">{qty(it.quantity, it.unit, it.unitCode)}</span>
              </li>
            ))}
          </ul>
          {more > 0 ? <p className="mt-2 text-xs text-zinc-600">{t("moreItems", { n: more })}</p> : null}
        </section>
      ) : null}

      {d.closed ? null : (
        <p className="mt-6 flex items-start gap-2 text-sm text-zinc-700">
          <Lock className="mt-0.5 h-4 w-4 shrink-0 text-zinc-600" aria-hidden />
          <span>
            {t("sealedBid")} {t("freeToQuote")}
          </span>
        </p>
      )}

      {d.closed ? (
        <div className="mt-6 rounded-xl bg-zinc-100 p-4">
          <p className="text-sm font-semibold text-zinc-900">{t("closedTitle")}</p>
          <p className="mt-1 text-sm text-zinc-700">{t(d.accepted ? "closedBodyMember" : "closedBody")}</p>
        </div>
      ) : null}

      <div className="mt-6 flex flex-col gap-2 sm:flex-row sm:items-center">
        <Link
          href={d.accepted ? loginHref : signupHref}
          className="inline-flex items-center justify-center rounded-full bg-blue-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-blue-700"
        >
          {ctaLabel}
        </Link>
        <Link href={`/davet-kapat?token=${encodeURIComponent(ref)}`} className="text-sm text-zinc-600 hover:text-zinc-900 sm:ml-auto">
          {t("optOut")}
        </Link>
      </div>
    </Shell>
  );
}

export default function Page() {
  return (
    <Suspense fallback={null}>
      <PreviewInner />
    </Suspense>
  );
}
