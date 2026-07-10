"use client";

import { Badge } from "@/components/catalyst/badge";
import { useGlobalSearch } from "@/hooks/use-admin-support";
import { countryFlag } from "@/lib/country";
import { Search } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

/**
 * Global arama — üst barda tek kutu: firma adı/kodu/vergi no + kullanıcı
 * e-postası. Sonuç tıklanınca ilgili firma detayına gider.
 */
export function GlobalSearch() {
  const router = useRouter();
  const [q, setQ] = useState("");
  const [debounced, setDebounced] = useState("");
  const [open, setOpen] = useState(false);
  const boxRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebounced(q), 250);
    return () => clearTimeout(t);
  }, [q]);

  const results = useGlobalSearch(debounced);

  useEffect(() => {
    const onClick = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onClick);
    return () => document.removeEventListener("mousedown", onClick);
  }, []);

  const go = (companyId: string) => {
    setOpen(false);
    setQ("");
    router.push(`/admin/firmalar/${companyId}`);
  };

  const companies = results.data?.companies ?? [];
  const users = results.data?.users ?? [];
  const showResults = open && debounced.trim().length >= 2;

  return (
    <div ref={boxRef} className="relative w-full max-w-md">
      <div className="relative">
        <Search className="text-admin-text-muted pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2" />
        <input
          value={q}
          onChange={(e) => {
            setQ(e.target.value);
            setOpen(true);
          }}
          onFocus={() => setOpen(true)}
          placeholder="Firma / kod / vergi no / kullanıcı e-postası ara..."
          aria-label="Global arama"
          className="border-admin-border bg-admin-surface text-admin-text w-full rounded-lg border py-1.5 pr-3 pl-9 text-sm"
        />
      </div>
      {showResults ? (
        <div className="bg-admin-surface border-admin-border absolute top-full right-0 left-0 z-50 mt-1 max-h-[420px] overflow-y-auto rounded-xl border shadow-xl">
          {results.isLoading ? (
            <p className="text-admin-text-muted px-4 py-3 text-sm">
              Aranıyor...
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
                        <Badge color={c.tier === "PAKET" ? "amber" : "zinc"}>
                          {c.tier === "PAKET" ? "Premium" : "Standart"}
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
  );
}
