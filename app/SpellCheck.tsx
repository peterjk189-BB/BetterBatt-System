"use client";

import { useEffect } from "react";

/**
 * Turns on the browser's spell check (Australian English) for every text box and notes field.
 * Browsers leave single-line boxes unchecked by default, so this switches them on, including
 * boxes that appear later (dialogs, new rows). Add data-nospell to any box that should be skipped.
 */
export default function SpellCheck() {
  useEffect(() => {
    const apply = (root: ParentNode) => {
      root.querySelectorAll<HTMLElement>('textarea, input[type="text"], input:not([type])').forEach((el) => {
        if (el.hasAttribute("data-nospell") || el.getAttribute("spellcheck") !== null) return;
        el.setAttribute("spellcheck", "true");
        el.setAttribute("lang", "en-AU");
      });
    };
    apply(document);
    const obs = new MutationObserver((muts) => {
      for (const m of muts) m.addedNodes.forEach((n) => n instanceof HTMLElement && apply(n.matches("textarea, input") ? (n.parentNode ?? document) : n));
    });
    obs.observe(document.body, { childList: true, subtree: true });
    return () => obs.disconnect();
  }, []);
  return null;
}
