"use client";

import { Input, InputGroup } from "@/components/catalyst/input";
import { cn } from "@/lib/utils";
import { MagnifyingGlassIcon } from "@heroicons/react/16/solid";
import { X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { useDebouncedCallback } from "use-debounce";

interface Props {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  className?: string;
  debounceMs?: number;
  /**
   * Admin arama DTO'ları `@MaxLength(120)` — sınırsız kutuda uzun metin 400 +
   * "Veri alınamadı" veriyordu (arayüz testi D-212).
   */
  maxLength?: number;
}

/** Admin liste arama uçlarının ortak üst sınırı (API DTO'larıyla aynı). */
export const SEARCH_MAX_LENGTH = 120;

/**
 * Liste sayfaları için debounced search — Catalyst InputGroup + Input.
 */
export function SearchInput({
  value,
  onChange,
  placeholder = "Ara...",
  className,
  debounceMs = 300,
  maxLength = SEARCH_MAX_LENGTH,
}: Props) {
  const [local, setLocal] = useState(value);
  // Gönderilip henüz dışarıdan (URL/state) geri gelmemiş değerler, sırayla.
  const sent = useRef<string[]>([]);

  const debounced = useDebouncedCallback((v: string) => {
    sent.current.push(v);
    onChange(v);
  }, debounceMs);

  // Dış `value` yerel metni YALNIZ gerçek bir dış değişiklikte (filtre
  // temizleme, geri/ileri) ezer. URL'e bağlı listelerde (router.replace →
  // useSearchParams) kendi gönderdiğimiz değer bir sunucu turu sonra geri
  // gelir; o arada yazılan karakterler siliniyordu (derin denetim LU-13).
  useEffect(() => {
    if (debounced.isPending()) return; // kullanıcı yazıyor; son hali gönderilecek
    const i = sent.current.indexOf(value);
    if (i !== -1) {
      sent.current.splice(0, i + 1); // kendi yankımız (ara değerler dahil)
      return;
    }
    sent.current = [];
    setLocal(value);
  }, [value]);

  const handleChange = (v: string) => {
    setLocal(v);
    debounced(v);
  };

  const handleClear = () => {
    setLocal("");
    debounced.cancel();
    sent.current.push("");
    onChange("");
  };

  return (
    <div className={cn("relative", className)}>
      <InputGroup>
        <MagnifyingGlassIcon data-slot="icon" />
        <Input
          type="text"
          value={local}
          maxLength={maxLength}
          onChange={(e) => handleChange(e.target.value)}
          placeholder={placeholder}
          className={local ? "[&_input]:pr-9" : undefined}
        />
      </InputGroup>
      {local ? (
        <button
          type="button"
          onClick={handleClear}
          className="absolute right-2 top-1/2 z-10 -translate-y-1/2 rounded-md p-1 text-zinc-400 transition-colors hover:bg-zinc-100 hover:text-zinc-600"
          aria-label="Aramayı temizle"
        >
          <X className="h-3.5 w-3.5" />
        </button>
      ) : null}
    </div>
  );
}
