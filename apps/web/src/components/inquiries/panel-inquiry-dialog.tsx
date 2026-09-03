"use client";

import { useSendInquiry } from "@/hooks/use-inquiries";
import { extractErrorMessage } from "@/lib/tenders/error";
import {
  PRODUCT_SEED_KEY,
  type ProductSeed,
} from "@/lib/tenders/map-product-to-form";
import { Dialog, DialogPanel, DialogTitle } from "@headlessui/react";
import { CheckCircleIcon, XMarkIcon } from "@heroicons/react/20/solid";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

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
  seed,
}: {
  open: boolean;
  onClose: () => void;
  companySlug: string;
  productSlug: string;
  productName: string;
  companyName: string;
  /** Talep sihirbazına taşınacak ürün tohumu. */
  seed: ProductSeed;
}) {
  const send = useSendInquiry();
  const router = useRouter();
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

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
      setError(extractErrorMessage(err, "Talep gönderilemedi"));
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

  return (
    <Dialog open={open} onClose={onClose} className="relative z-50">
      <div className="fixed inset-0 bg-zinc-950/40" aria-hidden />
      <div className="fixed inset-0 flex items-center justify-center p-4">
        <DialogPanel className="w-full max-w-lg rounded-2xl bg-white p-6 shadow-xl">
          <div className="flex items-start justify-between gap-4">
            <DialogTitle className="text-lg font-semibold tracking-tight text-zinc-950">
              {sent ? "Talebiniz gönderildi" : "Bilgi / teklif iste"}
            </DialogTitle>
            <button
              type="button"
              onClick={onClose}
              className="-m-1 rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
              aria-label="Kapat"
            >
              <XMarkIcon aria-hidden className="size-5" />
            </button>
          </div>

          {sent ? (
            <div className="mt-6">
              <p className="flex items-start gap-2 rounded-xl bg-emerald-50 p-4 text-sm/6 text-emerald-900 ring-1 ring-emerald-600/20">
                <CheckCircleIcon aria-hidden className="mt-0.5 size-4 shrink-0" />
                <span>
                  Talebiniz <strong>{companyName}</strong> firmasına iletildi.
                  Yanıt geldiğinde Bilgi Taleplerim sayfanızda görürsünüz.
                </span>
              </p>
              <div className="mt-6 flex flex-wrap gap-2">
                <Link
                  href="/company/satinalma/bilgi-taleplerim"
                  className="flex-1 rounded-full bg-zinc-950 px-4 py-2.5 text-center text-sm font-semibold text-white hover:bg-zinc-800"
                >
                  Taleplerimi gör
                </Link>
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 hover:bg-zinc-50"
                >
                  Kapat
                </button>
              </div>
            </div>
          ) : (
            <form onSubmit={(e) => void submit(e)} className="mt-5 space-y-4">
              <p className="text-sm/6 text-zinc-500">
                <strong className="text-zinc-900">{productName}</strong>{" "}
                hakkında {companyName} firmasına soru gönderin. Firma adınız
                talebe eklenir; e-posta adresiniz satıcıya gösterilmez.
              </p>

              <div>
                <label
                  htmlFor="pinq-quantity"
                  className="block text-sm font-medium text-zinc-900"
                >
                  Miktar
                </label>
                <input
                  id="pinq-quantity"
                  name="quantity"
                  maxLength={60}
                  placeholder="örn. 500 adet"
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              <div>
                <label
                  htmlFor="pinq-message"
                  className="block text-sm font-medium text-zinc-900"
                >
                  Mesajınız <span className="text-zinc-400">*</span>
                </label>
                <textarea
                  id="pinq-message"
                  name="message"
                  required
                  minLength={10}
                  maxLength={3000}
                  rows={4}
                  placeholder="İhtiyacınızı, teslim yerini ve termini yazın."
                  className="mt-1 w-full rounded-lg border border-zinc-300 px-3 py-2 text-sm outline-none focus:border-zinc-900 focus:ring-2 focus:ring-zinc-900/10"
                />
              </div>

              {error ? (
                <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-700 ring-1 ring-red-600/20">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={send.isPending}
                className="w-full rounded-full bg-zinc-950 px-4 py-2.5 text-sm font-semibold text-white transition hover:bg-zinc-800 disabled:opacity-50"
              >
                {send.isPending ? "Gönderiliyor…" : "Talebi gönder"}
              </button>

              <div className="border-t border-zinc-950/5 pt-4">
                <button
                  type="button"
                  onClick={toTender}
                  className="w-full rounded-full border border-zinc-300 px-4 py-2.5 text-sm font-medium text-zinc-800 transition hover:bg-zinc-50"
                >
                  Bu ürünü satın alma talebime ekle
                </button>
                <p className="mt-2 text-center text-xs text-zinc-500">
                  Bilgi talebi tek firmaya gider; satın alma talebi uygun tüm
                  tedarikçilerden teklif toplar.
                </p>
              </div>
            </form>
          )}
        </DialogPanel>
      </div>
    </Dialog>
  );
}
