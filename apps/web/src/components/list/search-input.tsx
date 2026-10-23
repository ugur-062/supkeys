"use client";

import { useTranslations } from "next-intl";
import { Input, InputGroup } from "@/components/catalyst/input";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { X } from "lucide-react";
import { useEffect, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
}

/**
 * Liste sayfaları için debounced search — Catalyst InputGroup + Input.
 */
export function SearchInput({
  value,
  onChange,
  placeholder,
  className,
  debounceMs = 300,
}: Props) {
  const t = useTranslations("web.panel.shell.searchInput");
  const [local, setLocal] = useState(value);

  useEffect(() => {
    setLocal(value);
  }, [value]);

  const debounced = useDebouncedCallback((v: string) => {
    onChange(v);
  }, debounceMs);

  const handleChange = (v: string) => {
    setLocal(v);
    debounced(v);
  };

  const handleClear = () => {
    setLocal("");
    debounced.cancel();
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <InputGroup>
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          type="text"
          value={local}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder ?? t("ara")}
          // Telefonda metin, temizle düğmesinin 40 px'lik dokunma alanının
          // altına girmesin diye sağ boşluk 44 px; `sm` ve üstü değişmedi.
          className={local ? "[&_input]:pr-11 sm:[&_input]:pr-9" : undefined}
        />
      </InputGroup>
      {local ? (
        // Görünen düğme 22 px kalır; dokunma alanı görünmez katmanla telefonda
        // 42 px (mobil denetim 2026-10 g07: 22×22 px idi), `sm` ve üstünde
        // 30 px (kutu 36 px yüksek, dışına taşmasın).
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors after:absolute after:-inset-2.5 hover:bg-zinc-100 hover:text-zinc-600 sm:after:-inset-1"
          aria-label={t("aramayiTemizle")}
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
