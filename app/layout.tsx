import type { Metadata, Viewport } from "next";
import type { ReactNode } from "react";
import { Inter } from "next/font/google";
import { ServiceWorkerRegister } from "@/components/sw-register";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const metadata: Metadata = {
  title: {
    default: "My Sticky Notes",
    template: "%s · My Sticky Notes",
  },
  description: "Save links and notes on your phone in seconds and open them on your laptop.",
  applicationName: "My Sticky Notes",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    title: "Sticky Notes",
    statusBarStyle: "default",
  },
  formatDetection: {
    telephone: false,
  },
  robots: {
    index: false,
    follow: false,
  },
};

export const viewport: Viewport = {
  themeColor: "#F5F5F2",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
};

// Chrome, Edge and Android can fire beforeinstallprompt before React loads,
// so the event is kept on window for the "Install app" button.
const INSTALL_PROMPT_SCRIPT = `window.addEventListener("beforeinstallprompt",function(e){e.preventDefault();window.__msnInstallPrompt=e;window.dispatchEvent(new Event("msn:installable"));});`;

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="en" className={inter.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: INSTALL_PROMPT_SCRIPT }} />
      </head>
      <body className="bg-app font-sans text-ink antialiased">
        {children}
        <ServiceWorkerRegister />
      </body>
    </html>
  );
}
