import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import { RegisterSW } from "@/components/app/RegisterSW";

const inter = Inter({ subsets: ["latin"], variable: "--font-inter", display: "swap" });

export const metadata: Metadata = {
  title: "RunPlan — goal-time training plans",
  description:
    "Generate a periodised, science-based running training plan from your goal race time.",
  manifest: "/manifest.webmanifest",
  icons: {
    icon: [
      { url: "/icon.svg", type: "image/svg+xml" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
    ],
    apple: "/icons/icon-192.png",
  },
  appleWebApp: { capable: true, title: "RunPlan", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#f5f6f8" },
    { media: "(prefers-color-scheme: dark)", color: "#0a0d13" },
  ],
  width: "device-width",
  initialScale: 1,
};

// Apply the persisted theme and text scale before paint to avoid a flash.
const themeScript = `(function(){try{var t=localStorage.getItem('runplan-theme');if(t)document.documentElement.setAttribute('data-theme',t);var f=parseInt(localStorage.getItem('runplan-fontscale')||'',10);if(f>=85&&f<=140)document.documentElement.style.fontSize=f+'%';}catch(e){}})();`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className={inter.variable}>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
