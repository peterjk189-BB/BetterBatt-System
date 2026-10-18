"use client";

import { useEffect, useState } from "react";

type Pref = "auto" | "light" | "dark";
const ORDER: Pref[] = ["auto", "light", "dark"];
const LABEL: Record<Pref, string> = { auto: "Auto", light: "Light", dark: "Dark" };

function apply(pref: Pref) {
  if (document.documentElement.hasAttribute("data-force-light")) return; // printable pages stay on white
  const dark = pref === "dark" || (pref === "auto" && window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.setAttribute("data-theme", dark ? "dark" : "light");
}

/** Header button: cycle Auto → Light → Dark. Remembered on this device. */
export default function ThemeToggle() {
  const [pref, setPref] = useState<Pref>("light");

  useEffect(() => {
    let p: Pref = "light";
    try {
      const s = localStorage.getItem("bb-theme");
      if (s === "light" || s === "dark" || s === "auto") p = s;
    } catch {}
    setPref(p);
    apply(p);
    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      let cur: string | null = "light";
      try {
        cur = localStorage.getItem("bb-theme");
      } catch {}
      if (cur === "auto") apply("auto");
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  function next() {
    const n = ORDER[(ORDER.indexOf(pref) + 1) % ORDER.length];
    setPref(n);
    try {
      localStorage.setItem("bb-theme", n);
    } catch {}
    apply(n);
  }

  return (
    <button
      type="button"
      onClick={next}
      title="Colour theme: click to switch Auto / Light / Dark"
      className="rounded-md border border-[var(--border)] px-2 py-1 text-xs hover:bg-[#f2f0ec]"
    >
      Theme: {LABEL[pref]}
    </button>
  );
}
