"use client";

import { installPopstateRestoreGuard, type PopstateRestoreGuard as Guard } from "@/lib/popstate-restore-guard";
import { useSelectedLayoutSegments } from "next/navigation";
import { useEffect, useRef } from "react";

/**
 * Kök (`[locale]`) düzende bir kez kurulur; hiçbir şey çizmez. Geri/İleri'den
 * sonra Next'in bayat sunucu yaması geri yüklenen sayfanın yerine önceki
 * sayfayı çizerse onarır — ayrıntı `lib/popstate-restore-guard.ts` (D-283).
 */
export function PopstateRestoreGuard() {
  // `[locale]` düzeninin altındaki etkin kesimler (işlenmiş ağaç).
  const segments = useSelectedLayoutSegments() ?? [];
  const key = segments.join("/");
  const segmentsRef = useRef<readonly string[]>(segments);
  const guardRef = useRef<Guard | null>(null);

  useEffect(() => {
    const guard = installPopstateRestoreGuard({
      getSegments: () => segmentsRef.current,
      depth: 1,
    });
    guardRef.current = guard;
    return () => {
      guard.dispose();
      guardRef.current = null;
    };
  }, []);

  useEffect(() => {
    segmentsRef.current = segments;
    guardRef.current?.check();
    // `segments` her çizimde yeni dizi; değişimi `key` temsil eder.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return null;
}
