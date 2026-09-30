import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Better Batt System",
  description: "Quoting, work orders, inventory and contractor pay for Better Batt Insulation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
