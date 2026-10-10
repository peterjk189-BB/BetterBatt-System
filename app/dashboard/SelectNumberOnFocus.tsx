"use client";

import { useEffect } from "react";

/**
 * Number boxes holding a value such as 0 are awkward to edit (the cursor lands at the end and the
 * 0 has to be deleted first). This selects the whole value when a number box is tapped or tabbed
 * into, so typing simply replaces it. Applies to every number input in the dashboard.
 */
export default function SelectNumberOnFocus() {
  useEffect(() => {
    let justFocused: HTMLInputElement | null = null;

    function onFocusIn(e: FocusEvent) {
      const el = e.target;
      if (!(el instanceof HTMLInputElement) || el.type !== "number" || el.readOnly || el.disabled) return;
      justFocused = el;
      try {
        el.select();
      } catch {
        /* ignore */
      }
    }
    // The mouse/finger release right after focusing would otherwise drop the selection and place the cursor.
    function onMouseUp(e: Event) {
      if (justFocused && e.target === justFocused) {
        e.preventDefault();
      }
      justFocused = null;
    }

    document.addEventListener("focusin", onFocusIn);
    document.addEventListener("mouseup", onMouseUp, true);
    document.addEventListener("pointerup", onMouseUp, true);
    return () => {
      document.removeEventListener("focusin", onFocusIn);
      document.removeEventListener("mouseup", onMouseUp, true);
      document.removeEventListener("pointerup", onMouseUp, true);
    };
  }, []);

  return null;
}
