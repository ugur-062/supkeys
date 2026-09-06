"use client";

import { Button } from "@/components/catalyst/button";
import { useCompanyMe, useUpgradePremium } from "@/hooks/use-company-auth";
import { extractErrorMessage } from "@/lib/tenders/error";
import { Check, Lock, Sparkles } from "lucide-react";
import Link from "next/link";
import { toast } from "sonner";

/** Premium ile açılan özellikler — kilitli sayfalardaki "reklam" listesi. */
const BENEFITS = [
  {
    title: "Satınalma paneli",
    desc: "Satın Alma Talebi açıp tedarikçilerden teklif topla, en iyi fiyatı yakala",
  },
  {
    title: "Satış ilanları",
    desc: "Ürün ve hizmetlerini yayınla, alıcılara doğrudan ulaş",
  },
  {
    title: "Detaylı raporlar",
    desc: "Tasarruf/kazanç analizi ve teklif karşılaştırma",
  },
  {
    title: "Hazır şablonlar",
    desc: "Saniyeler içinde satın alma talebi ve ilan oluştur",
  },
  {
    title: "Öne çıkan profil + davet",
    desc: "Keşfedilebilir ol, firmaları keşfet ve iş ortağı davet et",
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

  const docsVerified = me.data?.company.companyVerificationStatus === "VERIFIED";
  const twoFa = me.data?.user.twoFactorEnabled === true;
  // Premium için firma web sitesi zorunlu (link-benzeri).
  const hasWebsite = !!me.data?.company.website?.trim().includes(".");
  // Y2: self-servis yükseltme ödeme entegrasyonuna kadar kapalı (backend flag,
  // tek kaynak). Kapalıyken buton gizlenir; premium manuel admin grant ile.
  const selfUpgradeEnabled = me.data?.selfUpgradeEnabled === true;
  const ready = docsVerified && twoFa && hasWebsite;

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
      toast.error(extractErrorMessage(err, "Premium'a geçilemedi"));
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
            Premium ile neler açılır?
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

          {/* Geçiş gereksinimleri */}
          <div className="mt-6 rounded-xl border border-zinc-100 bg-zinc-50/60 p-4">
            <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-zinc-500">
              <Lock className="h-3.5 w-3.5" aria-hidden="true" />
              Premium&apos;a geçmek için
            </p>
            <ul className="mt-3 space-y-3">
              <Requirement
                done={!!docsVerified}
                title="Şirket belgelerini doğrula"
                hint={docsVerified ? "Doğrulandı" : docsHint}
                href="/company/ayarlar/dogrulama"
              />
              <Requirement
                done={!!twoFa}
                title="2 adımlı doğrulamayı (2FA) etkinleştir"
                hint={twoFa ? "Aktif" : "E-posta/uygulama tabanlı 2FA'yı açın"}
                href="/company/ayarlar/2fa"
              />
              <Requirement
                done={hasWebsite}
                title="Firma web sitesi adresini gir"
                hint={hasWebsite ? "Girildi" : "Firma profilinde web sitesi ekleyin"}
                href="/company/ayarlar/firma"
              />
            </ul>
          </div>

          {selfUpgradeEnabled ? (
            <>
              <Button
                className="mt-5 w-full"
                disabled={!ready || upgrade.isPending}
                onClick={doUpgrade}
              >
                {upgrade.isPending ? "Geçiliyor…" : "Premium'a Geç"}
              </Button>
              {!ready ? (
                <p className="mt-2 text-center text-xs text-zinc-400">
                  Yukarıdaki adımlar tamamlanınca aktifleşir.
                </p>
              ) : null}
            </>
          ) : (
            <p className="mt-5 rounded-xl border border-zinc-100 bg-zinc-50/60 px-4 py-3 text-center text-sm text-zinc-600">
              Premium şu an <span className="font-semibold">manuel onayla</span>{" "}
              veriliyor. Gereksinimleri tamamlayın; ekibimiz hesabınızı kısa
              sürede yükseltir.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

function Requirement({
  done,
  title,
  hint,
  href,
}: {
  done: boolean;
  title: string;
  hint: string;
  href: string;
}) {
  return (
    <li className="flex items-center justify-between gap-3 rounded-xl border border-zinc-100 px-4 py-3">
      <div className="flex items-center gap-3">
        <span
          className={`flex h-6 w-6 items-center justify-center rounded-full ${
            done ? "bg-emerald-500 text-white" : "bg-zinc-100 text-zinc-400"
          }`}
        >
          {done ? (
            <Check className="h-4 w-4" aria-hidden="true" />
          ) : (
            <Lock className="h-3 w-3" aria-hidden="true" />
          )}
        </span>
        <div>
          <p className="text-sm font-medium text-zinc-900">{title}</p>
          <p className="text-xs text-zinc-500">{hint}</p>
        </div>
      </div>
      {!done ? (
        <Link
          href={href}
          className="shrink-0 rounded-lg border border-zinc-200 px-3 py-1 text-xs font-semibold text-zinc-700 hover:border-zinc-300"
        >
          Aç
        </Link>
      ) : null}
    </li>
  );
}
