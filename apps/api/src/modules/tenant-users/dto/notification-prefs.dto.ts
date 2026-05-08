import { IsObject } from "class-validator";

/**
 * Frontend `{ prefs: { ... } }` formatında gönderir — schema-less,
 * key whitelist'i UI tarafında. Backend boolean olmayan değerleri filtreler.
 */
export class UpdateNotificationPrefsDto {
  @IsObject()
  prefs!: Record<string, unknown>;
}

export function sanitizeNotificationPrefs(
  raw: Record<string, unknown>,
): Record<string, boolean> {
  const out: Record<string, boolean> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (typeof v === "boolean") out[k] = v;
  }
  return out;
}
