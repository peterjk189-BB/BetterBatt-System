import type { ReactNode } from "react";
import ForceLight from "@/app/ForceLight";

export default function Layout({ children }: { children: ReactNode }) {
  return (
    <>
      <ForceLight />
      {children}
    </>
  );
}
