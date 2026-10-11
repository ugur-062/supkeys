/**
 * Engel kaldirma ("suppression clear") isareti — `EmailLog`'a yazilan ic kayit
 * (gercek e-posta degil). Uc tuketici: `EmailSuppressionService` (yazar +
 * turetme), `EmailService` gonderim kapisi ve admin yeniden gonderimi.
 *
 * Isaret YALNIZ servisin yazdigi satirdir: `provider="internal"` ve
 * `status="SENT"`. Eskiden sorgular yalniz `template` ile eslesiyordu; admin
 * ic kaydi "Yeniden Gonder"le gonderince ayni sablonlu FAILED bir satir
 * olusuyor ve o da isaret sayilip yeniden engellenmis adresi sessizce
 * akliyordu (arayuz testi O-078).
 */
export const SUPPRESSION_CLEAR_TEMPLATE = "suppression_clear";
export const INTERNAL_EMAIL_PROVIDER = "internal";

/** Gecerli isaret satirlarinin `where` parcasi (template + provider + status). */
export const SUPPRESSION_CLEAR_MARKER_WHERE = {
  template: SUPPRESSION_CLEAR_TEMPLATE,
  provider: INTERNAL_EMAIL_PROVIDER,
  status: "SENT" as const,
};

/** Ic kayit mi (yeniden gonderilemez: sablonu yok, gercek alici yok). */
export function isInternalEmailLog(log: {
  provider?: string | null;
  template?: string | null;
}): boolean {
  return (
    log.provider === INTERNAL_EMAIL_PROVIDER ||
    log.template === SUPPRESSION_CLEAR_TEMPLATE
  );
}
