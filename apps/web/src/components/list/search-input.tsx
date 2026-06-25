"use client";

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
  placeholder = "Ara...",
  className,
  debounceMs = 300,
}: Props) {
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
