"use client";

import { useLayoutEffect } from "react";

/** Printable / customer-facing pages always show on white paper, whatever the dark-mode setting. */
export default function ForceLight() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    // data-force-light stops the header's Theme button from switching this page back to dark.
    root.setAttribute("data-force-light", "1");
    root.setAttribute("data-theme", "light");
    return () => {
      root.removeAttribute("data-force-light");
      if (prev) root.setAttribute("data-theme", prev);
    };
  }, []);
  return null;
}
