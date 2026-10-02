"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";

// Redirects away from any dashboard page the signed-in user hasn't been
// granted a tab for. This is a navigation-level guard, not a data-security
// boundary — the real data access rules live in Supabase RLS. It just keeps
// someone from landing on (or guessing the URL of) a page their tab
// checklist doesn't include.
export default function AccessGuard({ allowedHrefs }: { allowedHrefs: string[] }) {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!pathname || pathname === "/dashboard") return; // the home page handles its own "no access" message
    const ok = allowedHrefs.some((href) => pathname === href || pathname.startsWith(href + "/"));
    if (!ok) router.replace("/dashboard");
  }, [pathname, allowedHrefs, router]);

  return null;
}
