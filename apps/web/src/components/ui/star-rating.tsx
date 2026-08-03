"use client";

import { StarIcon } from "@heroicons/react/20/solid";
import { useState } from "react";

/**
 * P2 (frontend denetimi §9 Rating) — ★ metin karakteri yerine SVG yıldız,
 * dolu renk --color-rating (amber, yalnız yıldızlarda); role="radiogroup" +
 * ok tuşları; seçimde sözlü etiket ("4 / 5 — İyi").
 */
const RATING_LABELS: Record<number, string> = {
  1: "Çok kötü",
  2: "Kötü",
  3: "Orta",
  4: "İyi",
  5: "Çok iyi",
};

export function ratingLabel(n: number): string {
  return RATING_LABELS[n] ?? "";
}

export function StarRating({
  value,
  onChange,
  readOnly = false,
  size = "md",
}: {
  value: number;
  onChange?: (n: number) => void;
  readOnly?: boolean;
  size?: "sm" | "md";
}) {
  const [hover, setHover] = useState(0);
  const active = hover || value;
  const px = size === "sm" ? "size-5" : "size-7";

  if (readOnly) {
    return (
      <span
        className="inline-flex items-center gap-1"
        role="img"
        aria-label={`${value} / 5 yıldız`}
      >
        {[1, 2, 3, 4, 5].map((n) => (
          <StarIcon
            key={n}
            className={`${px} ${n <= value ? "text-rating" : "text-zinc-300"}`}
            aria-hidden
          />
        ))}
      </span>
    );
  }

  return (
    <div
      role="radiogroup"
      aria-label="Puan"
      className="inline-flex items-center gap-1"
      onMouseLeave={() => setHover(0)}
    >
      {[1, 2, 3, 4, 5].map((n) => (
        <button
          key={n}
          type="button"
          role="radio"
          aria-checked={value === n}
          aria-label={`${n} yıldız — ${RATING_LABELS[n]}`}
          onClick={() => onChange?.(n)}
          onMouseEnter={() => setHover(n)}
          onKeyDown={(e) => {
            if (e.key === "ArrowRight" || e.key === "ArrowUp") {
              e.preventDefault();
              onChange?.(Math.min(5, value + 1));
            } else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              e.preventDefault();
              onChange?.(Math.max(1, value - 1));
            }
          }}
          className="-m-0.5 rounded-md p-0.5 transition hover:scale-110"
        >
          <StarIcon
            className={`${px} transition-colors ${
              n <= active ? "text-rating" : "text-zinc-300"
            }`}
            aria-hidden
          />
        </button>
      ))}
    </div>
  );
}
