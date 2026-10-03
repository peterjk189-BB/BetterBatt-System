"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

type NavLink = { href: string; label: string; group: string };

export default function Sidebar({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  const groups: string[] = [];
  for (const l of links) {
    if (!groups.includes(l.group)) groups.push(l.group);
  }

  return (
    <nav className="hidden w-48 shrink-0 border-r border-[var(--border)] bg-[#f2f0ec] px-3 py-6 sm:block print:hidden">
      {groups.map((g) => (
        <div key={g} className="mb-5">
          <div className="mb-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">{g}</div>
          <div className="flex flex-col gap-0.5">
            {links
              .filter((l) => l.group === g)
              .map((l) => {
                const active = pathname === l.href || pathname?.startsWith(l.href + "/");
                return (
                  <Link
                    key={l.href}
                    href={l.href}
                    className={`rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                      active ? "bg-accent text-white" : "text-[var(--muted)] hover:bg-white hover:text-[var(--text)]"
                    }`}
                  >
                    {l.label}
                  </Link>
                );
              })}
          </div>
        </div>
      ))}
    </nav>
  );
}
