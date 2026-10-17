"use client";

import { useLayoutEffect } from "react";

/** Printable / customer-facing pages always show on white paper, whatever the dark-mode setting. */
export default function ForceLight() {
  useLayoutEffect(() => {
    const root = document.documentElement;
    const prev = root.getAttribute("data-theme");
    root.setAttribute("data-theme", "light");
    return () => {
      if (prev) root.setAttribute("data-theme", prev);
    };
  }, []);
  return null;
}
