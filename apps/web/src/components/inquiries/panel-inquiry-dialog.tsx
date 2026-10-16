"use client";

import { useTranslations } from "next-intl";
import { useSendInquiry } from "@/hooks/use-inquiries";
import { extractErrorMessage } from "@/lib/tenders/error";
import { tRuntime } from "@/i18n/runtime";
import { isAxiosError } from "axios";
import {
  PRODUCT_SEED_KEY,
  type ProductSeed,
} from "@/lib/tenders/map-product-to-form";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import { Link } from "@/i18n/navigation";
import { useRouter } from "@/i18n/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { useSubmitLock } from "@/hooks/use-submit-lock";

/**
 * KAYITLI ALICININ bilgi talebi kutusu.
 *
 * Misafir kutusundan (`marketplace/inquiry-dialog`) ayrı bir bileşen olması
 * bilinçli: o kutu ad/e-posta/firma/telefon soruyor, bot tuzağı taşıyor ve
 * anonim uca düz `fetch` atıyor. Giriş yapmış kullanıcıya bunların HİÇBİRİ
 * uygulanmaz — kimlik zaten kanıtlı. Tek kutuyu iki moda bölmek, her alanın
 * yanına bir koşul koymak ve iki farklı gönderim yolunu tek gövdede
 * tutmak demekti.
 *
 * İKİNCİ EYLEM burada: "talebime kalem olarak ekle". Bilgi talebi TEK
 * satıcıya gider; asıl gücümüz aynı ihtiyacı çok satıcıya açan talep akışı.
 * Kullanıcı hangisini istediğine burada karar verir.
 */
export function PanelInquiryDialog({
  open,
  onClose,
  companySlug,
  productSlug,
  productName,
  companyName,
  sellerFreeMember = false,
  seed,
}: {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  productSlug: string;
  productName: string;
  companyName: string;
  /**
   * Satıcı ücretsiz üye (2026-09-06): soruyu görür ama yanıtlamak için
   * Silver'a geçmesi gerekir — alıcıya dürüst not, alternatif doğrulanmış
   * tedarikçiler ürün sayfasındaki benzer ürünlerde.
   */
  sellerFreeMember?: boolean;
  /** Talep sihirbazına taşınacak ürün tohumu. */
  seed: ProductSeed;
}) {
  const t = useTranslations("web.panel.trade.panelInquiryDialog");
  const send = useSendInquiry();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Çift tık / Enter tekrarı ikinci bilgi talebi açmasın (arayüz testi FX-00 O-031).
  const lock = useSubmitLock();
  /*
   * ODAKLI ALAN YAPIŞKAN ŞERİDİN ÜSTÜNDE (r3-comm#new1). Şerit kayan gövdenin
   * içinde olduğundan tarayıcının kendi odak / imleç kaydırması onu hesaba
   * katmaz: klavye açılıp gövde küçülünce "Mesajınız"ın alt satırları
   * şeridin altında kalıyordu (Chromium ölçümü: 109 px'lik kutunun 55 px'i).
   * Şeridin yüksekliği gövdenin `scroll-padding-bottom`u olur (hata satırıyla
   * büyür, gözlemci izler) ve odaklanan / yazılan alan ile pencere küçülünce
   * (klavye) odaktaki alan `scrollIntoView({block: "nearest"})` ile şeridin
   * üstüne getirilir — bu çağrı kaydırma payını sayar; görünürse kımıldamaz.
   */
  const bodyRef = useRef<HTMLDivElement | null>(null);
  const [footer, setFooter] = useState<HTMLDivElement | null>(null);
  const [footerH, setFooterH] = useState(0);
  useEffect(() => {
    if (!footer || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver(() => setFooterH(footer.offsetHeight));
    ro.observe(footer);
    return () => ro.disconnect();
  }, [footer]);
  const revealFocused = useCallback(() => {
    const el = typeof document === "undefined" ? null : document.activeElement;
    if (!(el instanceof HTMLElement) || !bodyRef.current?.contains(el)) return;
    if (!el.matches("input, textarea") || typeof el.scrollIntoView !== "function") return;
    el.scrollIntoView({ block: "nearest" });
  }, []);
  // Odak/yazı olayı ve klavye düzeni o karede değiştirir; ölçüm bir sonraki karede.
  const revealSoon = useCallback(() => {
    requestAnimationFrame(revealFocused);
  }, [revealFocused]);
  useEffect(() => {
    if (!open) return;
    let raf = 0;
    const onResize = () => {
      cancelAnimationFrame(raf);
      raf = requestAnimationFrame(revealFocused);
    };
    window.addEventListener("resize", onResize);
    return () => {
      cancelAnimationFrame(raf);
      window.removeEventListener("resize", onResize);
    };
  }, [open, revealFocused]);

  useEffect(() => {
    if (open) {
      setSent(false);
      setError(null);
    }
  }, [open]);

  const submit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    setError(null);
    try {
      await send.mutateAsync({
        companySlug,
        productSlug,
        message: String(fd.get("message") ?? ""),
        quantity: String(fd.get("quantity") ?? "") || undefined,
      });
      setSent(true);
    } catch (err) {
      // Hata YALNIZ burada (istek `skipErrorToast`, mobil denetim g05): toast
      // klavye açıkken kutunun başlığını ve Kapat'ını örtüyordu. Küresel
      // toast'ın yerini tuttuğu için onunla aynı ayrım: yanıtsız istekte (ağ)
      // bağlantı metni, 5xx'te çevrili sunucu metni — gövde okunmaz, Nest'in
      // varsayılan 500 gövdesi İngilizce "Internal server error" (r3-comm#new0).
      // İstek dışı (beklenmeyen JS) hatanın İngilizce `message`ı da basılmaz.
      const status = isAxiosError(err) ? err.response?.status : undefined;
      setError(
        !isAxiosError(err)
          ? t("talepGonderilemedi")
          : status === undefined
            ? tRuntime("common.errors.network")
            : status >= 500
              ? tRuntime("common.errors.server")
              : extractErrorMessage(err, t("talepGonderilemedi")),
      );
    }
  };

  const toTender = () => {
    // sessionStorage okunamayabilir (gizli sekme, site verisi kapalı) —
    // tohumsuz da olsa sihirbaz açılmalı, boş formla çalışır.
    try {
      sessionStorage.setItem(PRODUCT_SEED_KEY, JSON.stringify(seed));
    } catch {
      /* yok say */
    }
    onClose();
    router.push("/company/satinalma/taleplerim/yeni?urun=1");
  };

  /*
   * TELEFON YERLEŞİMİ (mobil denetim g05): kutu ortalanmış ve kaydırılamıyordu;
   * ekran klavyesi açılınca (görünüm ~480 px) 599 px'lik panelin başlığı ve
   * Kapat düğmesi ekranın üstünde kalıyordu. Artık panel görünür yüksekliğe
   * (`dvh`, klavyeyle küçülür) sığar: başlık üstte sabit, gövde kendi içinde
   * kayar. Hata satırı ve "Talebi gönder" gövdenin içinde altta YAPIŞKAN
   * (`sticky bottom-0`) — klavye açıkken de görünür. İkinci eylem ("talebime
   * ekle") ve notu yapışkan şeridin ARDINDA, gövdeyle kayar (r3-comm#new1:
   * sabit şerit ikisini de taşırken klavye + hata ile 480 px'in 263–299
   * px'ini alıyor, "Mesajınız"dan yalnız 2 satır görünüyordu). Sıra her
   * genişlikte aynı: alanlar, hata, gönder, ikinci eylem; içerik sığınca
   * (masaüstü, klavyesiz telefon) görünüm eskisiyle aynı. Telefonda alttan
   * açılan sayfa, sm+ ortada.
   */
  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-zinc-950/40" aria-hidden />
      {/* Güvenli alan (mobil kabuk): telefonda sayfanın tepesi durum çubuğunun,
          eylemleri ana ekran çizgisinin altında kalmaz; pay 0 iken aynı. */}
      <div className="fixed inset-0 flex items-end justify-center pt-[calc(1rem+var(--safe-top))] sm:items-center sm:p-4">
        <DialogPanel className="flex max-h-[calc(100dvh-1rem-var(--safe-top))] w-full max-w-lg flex-col overflow-hidden rounded-t-2xl bg-white shadow-xl sm:max-h-[calc(100dvh-2rem)] sm:rounded-2xl">
          <div className="flex shrink-0 items-start justify-between gap-4 px-6 pt-6 max-sm:px-4 max-sm:pt-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
              {sent ? t("talebinizGonderildi") : t("bilgiTeklifIste")}
            </DialogTitle>
            {/* Görünüm aynı; görünmez `after` katmanı dokunma alanını 44 px yapar. */}
            <button
              type="button"
              onClick={onClose}
              className="relative -m-1 rounded-lg p-1 text-zinc-400 after:absolute after:-inset-2 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label={t("kapat")}
            >
              <XMarkIcon aria-hidden className="size-5" />
            </button>
          </div>

          {sent ? (
            <div className="min-h-0 overflow-y-auto overscroll-contain px-6 pt-6 pb-6 max-sm:px-4 max-sm:pb-[max(1rem,var(--safe-bottom))]">
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm/6 text-emerald-900 ring-1 ring-emerald-600/20">
                <CheckCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  {t.rich("talebinizFirmasinaIletildi", {
                    company: companyName,
                    strong: (c) => <strong>{c}</strong>,
                  })}
                </span>
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/company/satinalma/bilgi-taleplerim"
                  className="flex-1 rounded-full bg-blue-600 px-4 py-2.5 text-center text-sm font-semibold text-white transition hover:bg-blue-700"
                >
                  {t("taleplerimiGor")}
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  {t("kapat")}
                </button>
              </div>
            </div>
          ) : (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                void lock.run(() => submit(e));
              }}
              // Alt güvenli pay formda: kayan gövde (ve yapışkan şerit) ana
              // ekran çizgisinin üstünde biter; pay 0 iken aynı.
              className="flex min-h-0 flex-1 flex-col max-sm:pb-(--safe-bottom)"
            >
              <div
                ref={bodyRef}
                onFocus={revealSoon}
                onInput={revealSoon}
                className="min-h-0 flex-1 overflow-y-auto overscroll-contain"
                style={footerH ? { scrollPaddingBottom: footerH } : undefined}
              >
                <div className="space-y-4 px-6 pt-5 pb-1 max-sm:px-4">
                  <p className="text-sm/6 text-zinc-500">
                    {t.rich("hakkindaFirmasinaSoruGonderin", {
                      product: productName,
                      company: companyName,
                      strong: (c) => <strong className="text-zinc-900">{c}</strong>,
                    })}
                  </p>
                  {sellerFreeMember ? (
                    <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs/5 text-amber-900 ring-1 ring-amber-600/20">
                      {t("buTedarikciDogrulanmamis")}
                    </p>
                  ) : null}

                  <div>
                    <label
                      htmlFor="pinq-quantity"
                      className="block text-sm font-medium text-zinc-900"
                    >
                      {t("miktar")}
                    </label>
                    <input
                      id="pinq-quantity"
                      name="quantity"
                      maxLength={60}
                      placeholder={t("orn500Adet")}
                      className="mt-1 w-full scroll-my-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>

                  <div>
                    <label
                      htmlFor="pinq-message"
                      className="block text-sm font-medium text-zinc-900"
                    >
                      {t("mesajiniz")} <span className="text-zinc-400">*</span>
                    </label>
                    <textarea
                      id="pinq-message"
                      name="message"
                      required
                      minLength={10}
                      maxLength={3000}
                      rows={4}
                      placeholder={t("ihtiyaciniziTeslimYeriniVeTermini")}
                      className="mt-1 w-full scroll-my-4 rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                    />
                  </div>
                </div>

                {/* Yapışkan alt şerit: YALNIZ hata satırı ve "Talebi gönder" —
                    gövde kaysa da, klavye açıkken de görünür. */}
                <div
                  ref={setFooter}
                  className="sticky bottom-0 z-10 space-y-4 bg-white px-6 pt-3 pb-4 max-sm:px-4"
                >
                  {error ? (
                    <p role="alert" className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
                      {error}
                    </p>
                  ) : null}
                  <button
                    type="submit"
                    disabled={send.isPending || lock.locked}
                    className="w-full rounded-full bg-blue-600 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-blue-700 disabled:opacity-50"
                  >
                    {send.isPending || lock.locked ? t("gonderiliyor") : t("talebiGonder")}
                  </button>
                </div>

                {/* İkinci eylem ve notu gövdeyle kayar (yapışkan değil). */}
                <div className="px-6 pb-6 max-sm:px-4 max-sm:pb-4">
                  <div className="border-t border-zinc-950/5 pt-4">
                    <button
                      type="button"
                      onClick={toTender}
                      className="w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
                    >
                      {t("buUrunuSatinAlmaTalebime")}
                    </button>
                    <p className="mt-2 text-center text-xs text-zinc-500">
                      {t("bilgiTalebiTekFirmayaGider")}
                    </p>
                  </div>
                </div>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
