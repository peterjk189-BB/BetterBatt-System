import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Better Batt System",
  description: "Quoting, work orders, inventory and contractor pay for Better Batt Insulation.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon-192.png", apple: "/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "Better Batt", statusBarStyle: "default" },
};

// Sets light/dark before the page paints so there is no white flash. "auto" follows the device.
const THEME_SCRIPT = `(function(){try{var p=localStorage.getItem("bb-theme")||"light";var d=p==="dark"||(p==="auto"&&window.matchMedia("(prefers-color-scheme: dark)").matches);document.documentElement.setAttribute("data-theme",d?"dark":"light")}catch(e){}})()`;

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_SCRIPT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
