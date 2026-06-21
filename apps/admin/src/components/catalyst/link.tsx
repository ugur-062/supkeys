/**
 * Catalyst Link — Next.js App Router'a bağlandı.
 * Catalyst bileşenleri (Button href, Sidebar, Dropdown, Pagination vb.) bu
 * Link'i kullanır; Headless.DataInteractive data-* attribute'lerini korur.
 */

import * as Headless from "@headlessui/react";
import NextLink, { type LinkProps } from "next/link";
import React, { forwardRef } from "react";

export const Link = forwardRef(function Link(
  props: LinkProps & React.ComponentPropsWithoutRef<"a">,
  ref: React.ForwardedRef<HTMLAnchorElement>,
) {
  return (
    <Headless.DataInteractive>
      <NextLink {...props} ref={ref} />
    </Headless.DataInteractive>
  );
});
