"use client";

import type { ComponentProps, MouseEvent } from "react";

type SmoothAnchorLinkProps = Omit<ComponentProps<"a">, "href"> & {
  href: `#${string}`;
};

export function SmoothAnchorLink({
  href,
  onClick,
  ...props
}: SmoothAnchorLinkProps) {
  function handleClick(event: MouseEvent<HTMLAnchorElement>) {
    onClick?.(event);

    if (
      event.defaultPrevented ||
      event.button !== 0 ||
      event.metaKey ||
      event.ctrlKey ||
      event.shiftKey ||
      event.altKey
    ) {
      return;
    }

    const target = document.getElementById(href.slice(1));
    if (!target) {
      return;
    }

    event.preventDefault();
    if (window.location.hash !== href) {
      window.history.pushState(null, "", href);
    }

    const behavior = window.matchMedia("(prefers-reduced-motion: reduce)")
      .matches
      ? "auto"
      : "smooth";
    target.scrollIntoView({ behavior, block: "start" });
  }

  return <a href={href} onClick={handleClick} {...props} />;
}
