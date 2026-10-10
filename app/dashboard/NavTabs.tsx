"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import TabIcon from "@/lib/TabIcon";

export default function NavTabs({ links }: { links: { key: string; href: string; label: string }[] }) {
  const pathname = usePathname();

  return (
    <nav className="flex flex-wrap gap-1.5">
      {links.map((l) => {
        const active = pathname === l.href || pathname?.startsWith(l.href + "/");
        return (
          <Link
            key={l.href}
            href={l.href}
            className={`flex items-center gap-1.5 rounded-lg border px-3 py-1.5 text-sm font-medium transition-colors ${
              active
                ? "border-accent bg-accent text-white"
                : "border-[var(--border)] text-[var(--muted)] hover:border-accent hover:text-[var(--text)]"
            }`}
          >
            <TabIcon tabKey={l.key} color="currentColor" size={16} className="shrink-0" />
            {l.label}
          </Link>
        );
      })}
    </nav>
  );
}
