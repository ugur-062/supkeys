"use client";

import { Button } from "@/components/ui/button";
import { SERVICE_SLOW_AFTER_MS, isServiceUnreachable, subscribeServiceHealth } from "@/lib/company-auth/service-health";
import { useQueryClient } from "@tanstack/react-query";
import { CloudOff, Loader2 } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

/**
 * PANEL: "SUNUCUYA ULAŞILAMIYOR" NOTU (2026-10-08, staging kesintisi).
 *
 * Panel kabuğu içeriği `/me` yanıtı gelene dek iskeletle bekletir (D-299).
 * API yanıt vermezken bu bekleyiş MESAJSIZDI: reddedilen bağlantıda ~8 sn,
 * asılı bağlantıda (uyuyan API) dakikalarca yalnız gri kutular — kullanıcı
 * sayfanın bozulduğunu sanıyordu. Bu not:
 *  - ilk `/me` gecikirse ya da ağ/5xx hatasıyla yeniden deneniyorsa iskeletin
 *    üstünde çıkar ("ulaşılamıyor, yeniden deneniyor" + "Tekrar dene");
 *  - `/me` kesin hataya düşünce (içerik anlık görüntüyle çizilir, her sayfa
 *    kendi hata kartını basar) üstte kalır, `/me`yi büyüyen aralıklarla birkaç
 *    kez kendiliğinden yeniden yoklar, sonra DURUR;
 *  - API dönünce kaybolur ve hataya düşmüş etkin sorguları yeniden çeker
 *    (sayfa kendiliğinden toparlanır).
 *
 * AÇIK OTURUM (2026-10-09, canlı doğrulama OUT-1): yukarıdakiler yalnız sayfa
 * YÜKLEMESİNDE işliyordu — `/me` yüklemede bir kez sorulur. Panel açıkken API
 * giderse (sahibin gerçek durumu: uyuyan staging API'si) not hiç çıkmıyordu.
 * Not artık panelin isteklerinin yaşadığını da dinler (`lib/company-auth/
 * service-health.ts`, `companyApi` interceptor'ları besler): bir istek yanıtsız
 * biter / 502 · 503 · 504 alır / ~6 sn yanıtsız kalırsa TEK `/me` yoklaması
 * atılır; o da düşerse not çıkar, aynı yeniden yoklama takvimi işler. API'den
 * herhangi bir yanıt gelince not kapanır ve hatadaki etkin sorgular yeniden
 * çekilir. 4xx notu hiç tetiklemez.
 */

/** İlk `/me` yanıtı (ya da açık oturumda bir istek) bu kadar gecikirse şüphe doğar (ms). */
export { SERVICE_SLOW_AFTER_MS };

/**
 * Notun alt boşluğu — kabuğun içerik sarmalayıcısının üst boşluğuyla
 * (`shell.tsx` `py-6 lg:py-8`) AYNI olmalı; bkz. `ServiceNotice`.
 */
export const SERVICE_NOTICE_GAP_CLASS = "mb-6 lg:mb-8";

/** `/me` kesin hataya düştükten sonraki otomatik yoklama aralıkları (ms). */
export const SERVICE_RECHECK_DELAYS_MS: readonly number[] = [10_000, 20_000, 40_000, 60_000];

/** Sunucuya ulaşılamadı mı: yanıt yok (ağ hatası / zaman aşımı) ya da 5xx. */
export function isUnreachableError(error: unknown): boolean {
  if (!error) return false;
  const status = (error as { response?: { status?: number } }).response?.status;
  return status === undefined || status >= 500;
}

/** Kabuğun `/me` sorgusundan okunan alanlar (TanStack Query sonucu). */
export interface MeQueryState {
  isError: boolean;
  isSuccess: boolean;
  isFetching: boolean;
  error: unknown;
  failureCount: number;
  failureReason: unknown;
  refetch: () => unknown;
}

export type ServiceNoticePhase = "hidden" | "retrying" | "waiting" | "stopped";

/**
 * @param pending içerik hâlâ `/me`yi bekliyor mu (`permissionsSynced` false)
 */
export function useServiceNotice(me: MeQueryState, pending: boolean): { phase: ServiceNoticePhase; retryNow: () => void } {
  const queryClient = useQueryClient();
  const [slow, setSlow] = useState(false);
  const [rechecks, setRechecks] = useState(0);
  const wasDown = useRef(false);
  const refetchRef = useRef(me.refetch);
  useEffect(() => {
    refetchRef.current = me.refetch;
  }, [me.refetch]);
  // `/me`yi yeniden sor — uçuşta bir yoklama varken ikincisi atılmaz. Bayrak
  // sorgunun KENDİ sözünden okunur: React'in gördüğü `isFetching` bir tık
  // geriden gelir (yanıt, "çekiliyor" çizilmeden dönebilir).
  const recheckInFlight = useRef(false);
  const recheck = useCallback(() => {
    if (recheckInFlight.current) return;
    recheckInFlight.current = true;
    const release = () => {
      recheckInFlight.current = false;
    };
    void Promise.resolve(refetchRef.current()).then(release, release);
  }, []);

  // İlk yanıt gecikiyor (asılı bağlantı: hata sayacı artmadan saniyeler geçer).
  useEffect(() => {
    if (!pending) {
      setSlow(false);
      return;
    }
    const timer = setTimeout(() => setSlow(true), SERVICE_SLOW_AFTER_MS);
    return () => clearTimeout(timer);
  }, [pending]);

  // AÇIK OTURUM: panelin istekleri kesinti belirtisi gösterdi ve `/me`
  // yoklaması da düştü; API'den bir yanıt gelene dek doğru kalır.
  const signalDown = useSyncExternalStore(subscribeServiceHealth, isServiceUnreachable, () => false);

  const connecting = pending && (slow || (me.failureCount > 0 && isUnreachableError(me.failureReason)));
  const meDown = me.isError && isUnreachableError(me.error);
  const down = meDown || signalDown;
  // YAPIŞKAN: hiç başarılı olmamış `/me` yeniden yoklanırken TanStack Query
  // durumu "error"dan "pending"e geri alır (`isError` düşer). Not o sırada
  // kaybolmasın — yerel yığında ölçüldü: API hâlâ kapalıyken her yoklamada not
  // ~7 sn yok oluyordu. Yalnız başarı (ya da kesinti olmayan bir hata) kapatır.
  const [unreachable, setUnreachable] = useState(false);
  const otherError = me.isError && !meDown;
  useEffect(() => {
    if (connecting || down) setUnreachable(true);
    else if (me.isSuccess || otherError) setUnreachable(false);
  }, [connecting, down, me.isSuccess, otherError]);
  const visible = connecting || down || (unreachable && !me.isSuccess && !otherError);

  // Kesinti (kesin `/me` hatası ya da sağlık sinyali): `/me` büyüyen aralıklarla
  // birkaç kez yeniden yoklanır, sonra durur.
  useEffect(() => {
    if (!down || me.isFetching || rechecks >= SERVICE_RECHECK_DELAYS_MS.length) return;
    const fire = () => {
      setRechecks((n) => n + 1);
      recheck();
    };
    // Gizli sekmede yoklanmaz: süre dolduysa sekme görünür olunca yoklar.
    const onVisible = () => {
      if (document.visibilityState !== "visible") return;
      document.removeEventListener("visibilitychange", onVisible);
      fire();
    };
    const timer = setTimeout(() => {
      if (document.visibilityState === "hidden") document.addEventListener("visibilitychange", onVisible);
      else fire();
    }, SERVICE_RECHECK_DELAYS_MS[rechecks]);
    return () => {
      clearTimeout(timer);
      document.removeEventListener("visibilitychange", onVisible);
    };
  }, [down, me.isFetching, rechecks, recheck]);

  // Toparlanma: not göründükten sonra `/me` başarılı → hataya düşmüş etkin
  // sorgular yeniden çekilir (sayfaların "Veri alınamadı" kartları kendiliğinden
  // kapanır), sayaç sıfırlanır.
  useEffect(() => {
    if (visible) {
      wasDown.current = true;
      return;
    }
    if (!wasDown.current || !me.isSuccess) return;
    wasDown.current = false;
    setRechecks(0);
    void queryClient.refetchQueries({ type: "active", predicate: (query) => query.state.status === "error" });
  }, [visible, me.isSuccess, queryClient]);

  // Sağlık sinyali temizlendi (başka bir istek yanıt aldı) ama `/me` önceki
  // yoklamadan hatada kaldı → sıradaki takvimi beklemeden hemen yeniden sorulur;
  // başarısı notu kapatır ve aşağıdaki toparlanmayı tetikler.
  const lastSignalDown = useRef(false);
  useEffect(() => {
    const recovered = lastSignalDown.current && !signalDown;
    lastSignalDown.current = signalDown;
    if (recovered && meDown && !me.isFetching) recheck();
  }, [signalDown, meDown, me.isFetching, recheck]);

  // Elle: başarılı olmayan (bekleyen ya da hatalı) bütün etkin sorgular — `/me` dahil.
  const retryNow = () => {
    void queryClient.refetchQueries({ type: "active", predicate: (query) => query.state.status !== "success" });
    // Açık oturumda `/me` hâlâ "başarılı" durumdadır (kesintiyi sinyal söyledi);
    // yukarıdaki süzgeç onu atlar. Ekranda hatalı sorgu olmasa da düğme bir şey
    // yapsın: API'nin dönüp dönmediği `/me` ile sorulur.
    if (me.isSuccess) recheck();
  };

  const phase: ServiceNoticePhase = !visible
    ? "hidden"
    : me.isFetching
      ? "retrying"
      : rechecks >= SERVICE_RECHECK_DELAYS_MS.length
        ? "stopped"
        : "waiting";
  return { phase, retryNow };
}

export function ServiceNotice({ me, pending }: { me: MeQueryState; pending: boolean }) {
  // Metinler kök kataloğun `web.shared` ad alanında (herkese açık kesinti
  // ekranıyla ortak) — panel sağlayıcısı kök mesajları da taşır.
  const t = useTranslations("web.shared.unavailable");
  const { phase, retryNow } = useServiceNotice(me, pending);
  if (phase === "hidden") return null;
  return (
    <div
      role="status"
      data-testid="service-notice"
      data-service-notice={phase}
      /* ALT BOŞLUK = KABUĞUN ÜST BOŞLUĞU (`py-6 lg:py-8`; canlı doğrulama
         2026-10-09, OUTR-7). İki panel anasayfasının hero bandı kabuğun üst
         boşluğunu negatif marjla iptal eder (`-mt-6 lg:-mt-8`, fotoğraf üst
         çubuğun hemen altında başlasın diye) ve içerik alanının İLK çocuğu
         olduğunu varsayar. Not onun üstüne oturunca `mb-4` yetmiyordu: bant
         notun alt 14 px'ini (telefonda 6 px) örtüyor, alt kenarlık ve ikinci
         satırın boşluğu kayboluyordu. Boşluk kabuğunkiyle aynı olunca bant
         notun tam altında başlar; öbür sayfalarda not ile içerik arası
         kabuğun kendi boşluğu kadar olur. */
      className={`${SERVICE_NOTICE_GAP_CLASS} flex flex-wrap items-center gap-x-4 gap-y-3 rounded-xl border border-amber-200 bg-amber-50 px-4 py-3`}
    >
      <CloudOff className="size-5 shrink-0 text-amber-700" aria-hidden="true" />
      <div className="min-w-0 flex-[1_1_16rem] space-y-0.5">
        <p className="text-sm font-semibold text-zinc-900">{t("serviceTitle")}</p>
        <p className="flex flex-wrap items-center gap-x-2 text-sm text-zinc-700">
          {phase === "retrying" ? <Loader2 className="size-4 shrink-0 animate-spin" aria-hidden="true" /> : null}
          <span>{t(phase === "retrying" ? "retrying" : phase === "stopped" ? "stopped" : "serviceWaiting")}</span>
          {pending ? null : <span>{t("serviceStale")}</span>}
        </p>
      </div>
      <Button
        type="button"
        variant="secondary"
        size="sm"
        className="ml-auto shrink-0 whitespace-nowrap"
        onClick={retryNow}
      >
        {t("retry")}
      </Button>
    </div>
  );
}
