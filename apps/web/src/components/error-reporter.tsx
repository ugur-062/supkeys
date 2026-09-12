"use client";

import { installGlobalErrorReporter } from "@/lib/client-error";
import { useEffect } from "react";

/** Kök düzende bir kez kurulur; hiçbir şey çizmez. */
export function ErrorReporter() {
  useEffect(() => installGlobalErrorReporter(), []);
  return null;
}
