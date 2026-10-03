"use client";

import { TIER_COLOR, TIER_LABEL } from "@/lib/terms";
import { Badge } from "@/components/catalyst/badge";
import { useGlobalSearch } from "@/hooks/use-admin-support";
import { countryFlag } from "@/lib/country";
import { cn } from "@/lib/utils";
import { Search } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/** API arama DTO'larıyla aynı üst sınır (arayüz testi D-212). */
export const GLOBAL_SEARCH_MAX_LENGTH = 120;

/**
 * Global arama — üst barda tek kutu: firma adı/kodu/vergi no + kullanıcı
 * e-postası. Sonuç tıklanınca ilgili firma detayına gider.
 *
 * Mobilde (< sm) üst çubukta yalnız büyüteç düğmesi durur; kutu üst çubuğun
 * altında tam genişlik katman olarak açılır (arayüz testi D-031: tek satırlık
 * üst çubukta 50 px'e sıkışıyordu).
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  /**
   * Sonuç gelmeden basılan Enter (arayüz testi O-073): basıldığı andaki
   * girdi saklanır, O girdinin sonucu gelince ilk sonuca gidilir. Önceden
   * gecikmeli (250 ms) arama yetişmeden Enter ÖNCEKİ aramanın ilk firmasını
   * açıyordu — yanlış firmada işlem riski.
   */
  const [pendingEnter, setPendingEnter] = useState<string | null>(null);
  const boxRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useGlobalSearch(debounced);

  // Rota değişince panel kapansın (klavye/tarayıcı navigasyonu dahil).
  const pathname = usePathname();
  // Bekleyen Enter da düşer: başka sayfadayken geç gelen sonuç beklenmedik
  // bir yönlendirme yapmasın.
  useEffect(() => {
    setOpen(false);
    setMobileOpen(false);
    setPendingEnter(null);
  }, [pathname]);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) {
        setOpen(false);
        setMobileOpen(false);
        setPendingEnter(null);
      }
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  // Mobil katman açılınca odak doğrudan kutuya.
  useEffect(() => {
    if (mobileOpen) inputRef.current?.focus();
  }, [mobileOpen]);

  const go = (companyId: string) => {
    setOpen(false);
    setMobileOpen(false);
    setPendingEnter(null);
    setQ("");
    router.push(`/admin/firmalar/${companyId}`);
  };

  /** Sonuçlar ŞU ANKİ girdiye mi ait? (gecikme bitti + yükleme yok) */
  const resultsCurrent =
    debounced === q && !results.isLoading && !!results.data;
  const firstTarget = (): string | undefined =>
    results.data?.companies[0]?.id ?? results.data?.users[0]?.companyId;

  // Bekleyen Enter: o girdinin sonucu gelince ilk sonuca git; sonuç yoksa ya
  // da arama hata verdiyse bekleyişi bırak (panel durumu zaten gösterir).
  useEffect(() => {
    if (pendingEnter === null) return;
    if (pendingEnter !== q) {
      setPendingEnter(null);
      return;
    }
    if (debounced !== q) return;
    if (results.isError) {
      setPendingEnter(null);
      return;
    }
    if (!resultsCurrent) return;
    const first = firstTarget();
    if (first) go(first);
    else setPendingEnter(null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingEnter, q, debounced, resultsCurrent, results.isError]);

  const companies = results.data?.companies ?? [];
  const users = results.data?.users ?? [];
  const showResults = open && debounced.trim().length >= 2;

  return (
    <div
      ref={boxRef}
      className="relative flex w-full max-w-md justify-end sm:block"
    >
      <button
        type="button"
        onClick={() => {
          // Mobil katmanı kapatmak bekleyen Enter'ı da iptal eder.
          if (mobileOpen) setPendingEnter(null);
          setMobileOpen((v) => !v);
        }}
        aria-label="Aramayı aç"
        aria-expanded={mobileOpen}
        className="flex size-9 items-center justify-center rounded-lg text-zinc-500 hover:bg-zinc-950/5 hover:text-zinc-900 sm:hidden"
      >
        <Search className="size-5" aria-hidden />
      </button>
      <div
        className={cn(
          mobileOpen
            ? "fixed inset-x-0 top-14 z-50 border-b border-zinc-950/10 bg-white p-2 shadow-lg"
            : "hidden",
          "sm:static sm:block sm:border-0 sm:bg-transparent sm:p-0 sm:shadow-none",
        )}
      >
        <div className="relative">
          <Search className="text-admin-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
          <input
            ref={inputRef}
            value={q}
            maxLength={GLOBAL_SEARCH_MAX_LENGTH}
            onChange={(e) => {
              setQ(e.target.value);
              setOpen(true);
            }}
            onFocus={() => setOpen(true)}
            onKeyDown={(e) => {
              if (e.key === "Escape") {
                // Vazgeçildi: bekleyen Enter da iptal (arayüz testi O-073).
                setOpen(false);
                setMobileOpen(false);
                setPendingEnter(null);
                (e.target as HTMLInputElement).blur();
              } else if (e.key === "Enter") {
                // İlk sonuca git — hızlı akış. Sonuçlar bu girdiye ait değilse
                // (gecikme sürüyor / yükleniyor) Enter beklemeye alınır.
                if (q.trim().length < 2) return;
                const first = resultsCurrent ? firstTarget() : undefined;
                if (first) go(first);
                else if (!resultsCurrent) setPendingEnter(q);
              }
            }}
            placeholder="Firma / kod / vergi no / kullanıcı e-postası ara..."
            aria-label="Global arama"
            className="border-admin-border bg-admin-surface text-admin-text w-full rounded-lg border py-1.5 pr-3 pl-9 text-sm"
          />
        </div>
        {showResults ? (
          <div className="bg-admin-surface border-admin-border absolute top-full right-2 left-2 z-50 mt-1 max-h-[420px] overflow-y-auto rounded-xl border shadow-xl sm:right-0 sm:left-0">
            {results.isLoading ? (
              <p className="text-admin-text-muted px-4 py-3 text-sm">
                Aranıyor...
              </p>
            ) : results.isError ? (
              // Hata "Sonuç yok" gibi görünmesin (403/500/ağ).
              <p className="text-admin-text-muted px-4 py-3 text-sm">
                Arama yapılamadı — lütfen tekrar deneyin
              </p>
            ) : companies.length === 0 && users.length === 0 ? (
              <p className="text-admin-text-muted px-4 py-3 text-sm">
                Sonuç yok
              </p>
            ) : (
              <>
                {companies.length > 0 ? (
                  <div>
                    <p className="text-admin-text-muted px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase">
                      Firmalar
                    </p>
                    {companies.map((c) => (
                      <button
                        key={c.id}
                        type="button"
                        onClick={() => go(c.id)}
                        className="hover:bg-admin-border/20 flex w-full items-center justify-between px-4 py-2 text-left"
                      >
                        <span className="text-admin-text text-sm">
                          {countryFlag(c.country)} {c.name}
                          <span className="text-admin-text-muted ml-2 font-mono text-xs">
                            {c.rothernId ?? ""}
                          </span>
                        </span>
                        <span className="flex items-center gap-1.5">
                          {c.isBlocked ? <Badge color="red">Askıda</Badge> : null}
                          <Badge color={TIER_COLOR[c.tier] ?? "zinc"}>
                            {TIER_LABEL[c.tier] ?? c.tier}
                          </Badge>
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
                {users.length > 0 ? (
                  <div>
                    <p className="text-admin-text-muted px-4 pt-2.5 pb-1 text-[11px] font-semibold uppercase">
                      Kullanıcılar
                    </p>
                    {users.map((u) => (
                      <button
                        key={u.id}
                        type="button"
                        onClick={() => go(u.companyId)}
                        className="hover:bg-admin-border/20 flex w-full flex-col px-4 py-2 text-left"
                      >
                        <span className="text-admin-text text-sm">
                          {u.name}{" "}
                          <span className="text-admin-text-muted text-xs">
                            {u.email}
                          </span>
                        </span>
                        <span className="text-admin-text-muted text-xs">
                          {u.companyName}
                        </span>
                      </button>
                    ))}
                  </div>
                ) : null}
              </>
            )}
          </div>
        ) : null}
      </div>
    </div>
  );
}
