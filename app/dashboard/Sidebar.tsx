"use client";

import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import TabIcon from "@/lib/TabIcon";
import { GROUP_ACCENTS, GROUP_ACCENT_TEXT } from "@/lib/tabs";

type NavLink = { key: string; href: string; label: string; group: string };

export default function Sidebar({ links }: { links: NavLink[] }) {
  const pathname = usePathname();

  const groups: string[] = [];
  for (const l of links) {
    if (!groups.includes(l.group)) groups.push(l.group);
  }

  return (
    <nav className="hidden w-48 shrink-0 border-r border-[var(--border)] bg-[#f2f0ec] px-3 py-6 sm:block print:hidden">
      <div className="mb-6 px-2.5">
        <Image src="/logo.png" alt="Better Batt Insulation" width={140} height={70} className="h-8 w-auto" />
      </div>
      {groups.map((g) => {
        const accent = GROUP_ACCENTS[g] ?? "#2563eb";
        const accentText = GROUP_ACCENT_TEXT[g] ?? "#ffffff";
        return (
          <div key={g} className="mb-5">
            <div className="mb-1.5 flex items-center gap-1.5 px-2.5 text-[11px] font-semibold uppercase tracking-wide text-[var(--muted)]">
              <span className="h-1.5 w-1.5 rounded-full" style={{ backgroundColor: accent }} />
              {g}
            </div>
            <div className="flex flex-col gap-0.5">
              {links
                .filter((l) => l.group === g)
                .map((l) => {
                  const active = pathname === l.href || pathname?.startsWith(l.href + "/");
                  return (
                    <Link
                      key={l.href}
                      href={l.href}
                      style={active ? { backgroundColor: accent, color: accentText } : undefined}
                      className={`flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm font-medium transition-colors ${
                        active ? "" : "text-[var(--muted)] hover:bg-white hover:text-[var(--text)]"
                      }`}
                    >
                      <TabIcon tabKey={l.key} color="currentColor" size={18} className="shrink-0" />
                      <span className="min-w-0">{l.label}</span>
                    </Link>
                  );
                })}
            </div>
          </div>
        );
      })}
    </nav>
  );
}
