"use client";

import * as React from "react";
import { openCookieSettings } from "@/lib/consent";

/**
 * Reopens the cookie banner at its preferences panel, to change or withdraw
 * consent. Unstyled, so it can sit in a footer next to plain links or be
 * given to a Button with `asChild`.
 */
export function CookieSettingsButton({
  children = "Cookie settings",
  onClick,
  ...props
}: React.ComponentProps<"button">) {
  return (
    <button
      type="button"
      {...props}
      onClick={(event) => {
        onClick?.(event);
        if (!event.defaultPrevented) openCookieSettings();
      }}
    >
      {children}
    </button>
  );
}
