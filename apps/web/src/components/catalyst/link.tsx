import * as Headless from "@headlessui/react";
import { Link as IntlLink } from "@/i18n/navigation";
import React, { forwardRef } from "react";

/**
 * Catalyst bağlantısı — `next/link` yerine dil farkında `Link` (i18n Faz 1):
 * aktif dilin ön eki otomatik eklenir, Headless UI etkileşim verisi korunur.
 */
export const Link = forwardRef(function Link(
  props: React.ComponentPropsWithoutRef<typeof IntlLink>,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <Headless.DataInteractive>
      <IntlLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
