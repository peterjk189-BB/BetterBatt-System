import type { ReactNode } from "react";

/** The dark Better Batt look shared by the sign-in, forgot-password and set-password pages. */
export const authField =
  "w-full rounded-lg border border-[#45433e] bg-[#2a2926] px-3.5 py-2.5 text-[15px] text-[#f4f2ec] placeholder-[#8a877f] outline-none transition focus:border-[#fdb930] focus:ring-2 focus:ring-[#fdb930]/30";
/** Inline so the app-wide dark-theme remapping (globals.css) can't recolour the login cards. */
export const authFieldStyle = { backgroundColor: "#2a2926", color: "#f4f2ec" } as const;
export const authButton =
  "rounded-lg bg-[#fdb930] px-4 py-3 text-[15px] font-bold text-[#1b1a18] transition hover:bg-[#ffc84d] disabled:opacity-60";

export default function AuthShell({ title, subtitle, children }: { title: string; subtitle?: string; children: ReactNode }) {
  return (
    <main
      className="flex min-h-screen flex-col items-center justify-center px-5 py-10"
      style={{ background: "radial-gradient(ellipse at 50% 0%, #34302a 0%, #1b1a18 55%, #121211 100%)" }}
    >
      <div className="w-full max-w-[400px]">
        <div className="mb-7 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Better Batt Insulation" className="h-16 w-auto rounded-xl p-2 shadow-lg" style={{ backgroundColor: "#ffffff" }} />
          <p className="mt-4 text-[11px] font-semibold uppercase tracking-[0.22em] text-[#fdb930]">Better Batt Insulation</p>
          <p className="mt-1 text-sm text-[#a9a69d]">Job management system</p>
        </div>
        <div className="overflow-hidden rounded-2xl border border-[#3a3833] shadow-2xl" style={{ backgroundColor: "#21201d" }}>
          <div className="h-1 bg-[#fdb930]" />
          <div className="p-7">
            <h1 className="text-xl font-bold text-[#f4f2ec]">{title}</h1>
            {subtitle && <p className="mt-1 text-sm text-[#a9a69d]">{subtitle}</p>}
            {children}
          </div>
        </div>
        <p className="mt-6 text-center text-xs text-[#7c7a72]">
          Better Batt Insulation · Melbourne, Victoria
          <br />
          betterbattinsulation.com.au
        </p>
      </div>
    </main>
  );
}
