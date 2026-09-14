"use client";

import { Button } from "@/components/catalyst/button";
import { useCompanyMe, useUpgradePremium } from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/**
 * Paketle açılan özellikler — kilitli sayfalardaki "reklam" listesi (üç paket
 * 2026-09-06: Silver satış, Gold iki panel; vitrin ve dizin ücretsiz).
 */
const BENEFITS = [
  {
    title: "Herkese açık talepler (Silver)",
    desc: "Tüm açık satın alma taleplerini gör, sınırsız teklif ver, alıcı kimliğini gör",
  },
  {
    title: "Bağlantı daveti ve öncelik (Silver)",
    desc: "Firmalara davet gönder, dizinde önce sıralan, sınırsız ürün + belge/video",
  },
  {
    title: "Satınalma paneli (Gold)",
    desc: "Satın Alma Talebi açıp tedarikçilerden teklif topla, en iyi fiyatı yakala",
  },
  {
    title: "Raporlar ve şablonlar (Gold)",
    desc: "Tasarruf/kazanç analizi, teklif karşılaştırma, hazır talep şablonları",
  },
];

/**
 * İhale açma / Satınalma kapısı (Faz 3). Doğrulama tamamlanmadan Satınalma
 * paneli kilitli. 3 gereksinim: şirket belgeleri VERIFIED + 2FA aktif + firma
 * web sitesi girilmiş. Hepsi tamamsa "Premium'a Geç" ile tier PAKET olur.
 */
export function PremiumGate() {
  const me = useCompanyMe();
  const upgrade = useUpgradePremium();

  /**
   * TEK ŞART: DOĞRULAMA (2026-09-15, kullanıcı kararı). 2FA ve web sitesi
   * adımları KALDIRILDI — backend kapısı da tek şarta indi, ikisi birlikte
   * değişmeliydi: ekran "hazır" deyip sunucu reddederdi.
   *
   * 2FA neden çıktı: kapı yalnız yükseltme ANINDA bakıyordu, kullanıcı ertesi
   * gün kapatabiliyordu → onay kutusuydu, kontrol değil. Gerçek yeri
   * kazandırma ve fatura işlemleri (ödeme turunda).
   */
  const docsVerified = me.data?.company.companyVerificationStatus === "VERIFIED";
  // Y2: self-servis yükseltme ödeme entegrasyonuna kadar kapalı (backend flag,
  // tek kaynak). Kapalıyken buton gizlenir; premium manuel admin grant ile.
  const selfUpgradeEnabled = me.data?.selfUpgradeEnabled === true;
  const ready = docsVerified;

  const docsHint =
    me.data?.company.companyVerificationStatus === "PENDING"
      ? "Belgeleriniz inceleniyor (1-2 iş günü)"
      : me.data?.company.companyVerificationStatus === "REJECTED"
        ? "Reddedildi — belgeleri güncelleyin"
        : "Zorunlu belgeleri yükleyip doğrulamaya gönderin";

  const doUpgrade = async () => {
    try {
      await upgrade.mutateAsync();
      toast.success("Gold'a geçildi — satınalma paneli açıldı");
    } catch (err) {
      toast.error(extractErrorMessage(err, "Gold'a geçilemedi"));
    }
  };

  return (
    <div className="mx-auto max-w-xl px-4 py-12">
      <div className="overflow-hidden card">
        {/* Premium başlık şeridi — marka mavisi */}
        <div className="bg-gradient-to-br from-blue-600 to-indigo-700 px-6 py-7 text-white">
          <div className="flex items-center gap-2">
            <Sparkles className="h-5 w-5" aria-hidden="true" />
            <span className="text-xs font-semibold uppercase tracking-wider text-blue-100">
              Rothern Paketleri
            </span>
          </div>
          <h1 className="mt-2 text-xl font-bold">Bu özellik paketli üyelere özel</h1>
          <p className="mt-1 text-sm text-blue-100">
            Paketsiz üyeler yalnız davet edildikleri ve bağlantılarının
            satın alma taleplerine teklif verebilir. Paket alarak platformun tamamını açın.
          </p>
        </div>

        <div className="p-6">
          {/* Faydalar — Rothern Premium "reklamı" */}
          <p className="text-sm font-semibold text-zinc-900">
            Paketle neler açılır?
          </p>
          <ul className="mt-3 space-y-2.5">
            {BENEFITS.map((b) => (
              <li key={b.title} className="flex items-start gap-3">
                <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-emerald-100">
                  <Check
                    className="h-3 w-3 text-emerald-600"
                    aria-hidden="true"
                  />
                </span>
                <span className="text-sm text-zinc-700">
                  <span className="font-semibold text-zinc-900">{b.title}</span>{" "}
                  — {b.desc}
                </span>
              </li>
            ))}
          </ul>

          {/* ÖNCE DOĞRULAMA — doğrulanmamış firmada BİRİNCİL eylem budur,
              paket değil (2026-09-15, kullanıcı kararı). Doğrulama ÜCRETSİZ ve
              kendi başına değerli (profilde "Doğrulanmış" rozeti), o yüzden
              "paketin ön şartı" gibi değil kendi başına bir kazanım gibi
              sunuluyor. Doğrulanmışta bu blok sade bir onay satırına iner. */}
          {docsVerified ? (
            <div className="mt-6 rounded-xl border border-emerald-200 bg-emerald-50 p-4">
              <p className="flex items-center gap-2 text-sm font-semibold text-emerald-900">
                <Check className="h-4 w-4" aria-hidden="true" />
                Firmanız doğrulandı — paket seçebilirsiniz
              </p>
            </div>
          ) : (
            <div className="mt-6 rounded-xl border border-zinc-200 bg-zinc-50/60 p-4">
              <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
                <Lock className="h-3.5 w-3.5" aria-hidden="true" />
                Önce ücretsiz doğrulama
              </p>
              <p className="mt-2 text-sm text-zinc-700">
                Doğrulama <strong>ücretsizdir ve paket gerektirmez</strong>:
                profilinizde “Doğrulanmış” rozeti görünür, herkese açık taleplere
                teklif verebilirsiniz. Pakete geçiş de bundan sonra tek adım.
              </p>
              <p className="mt-1 text-xs text-zinc-500">{docsHint}</p>
              <Button href="/company/ayarlar/dogrulama" className="mt-3 w-full">
                Doğrulamaya git
              </Button>
            </div>
          )}

          {selfUpgradeEnabled ? (
            <>
              <Button
                className="mt-5 w-full"
                disabled={!ready || upgrade.isPending}
                onClick={doUpgrade}
              >
                {upgrade.isPending ? "Geçiliyor…" : "Gold'a Geç"}
              </Button>
              {!ready ? (
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Doğrulama tamamlanınca aktifleşir.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-center text-sm text-zinc-600">
              Gold paketi şu an <span className="font-semibold">manuel onayla</span>{" "}
              veriliyor. Gereksinimleri tamamlayın; ekibimiz hesabınızı kısa
              sürede yükseltir.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}
