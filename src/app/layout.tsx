import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ProfileProvider } from "@/components/app/ProfileProvider";
import { ProfileGate } from "@/components/app/ProfileGate";
import { ServiceWorkerManager } from "@/components/app/ServiceWorkerManager";

export const metadata: Metadata = {
  title: {
    default: "Cortex — Brain Training for Memory, Attention & Speed",
    template: "%s · Cortex",
  },
  description:
    "Free brain training in your browser: short daily sessions for memory, attention and speed. Nine exercises that adapt to your level, work offline, and keep your data private on your device.",
  openGraph: {
    title: "Cortex — Brain Training for Memory, Attention & Speed",
    description:
      "Short daily sessions for memory, attention and speed. Nine adaptive exercises, offline-capable, no account needed.",
    siteName: "Cortex",
    type: "website",
  },
  applicationName: "Cortex",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cortex",
  },
  icons: {
    icon: [
      { url: "/icons/favicon-48.png", sizes: "48x48", type: "image/png" },
      { url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" },
      { url: "/icons/icon-512.png", sizes: "512x512", type: "image/png" },
    ],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
};

export const viewport: Viewport = {
  themeColor: "#070b15",
  width: "device-width",
  initialScale: 1,
  // Zoom is deliberately disabled app-wide (Olle's call, 2026-08-12): a
  // zoomable standalone app pans around its own UI and feels broken, and an
  // accidental pinch or double-tap during a timed exercise corrupts the
  // round. The Larger text preference in Profile is the supported
  // low-vision path. This trips axe's meta-viewport rule, which is
  // disabled with a pointer to this decision — see e2e/a11y.spec.ts and
  // docs/accessibility.md ("Deliberately out of scope").
  maximumScale: 1,
  userScalable: false,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased">
        <ProfileProvider>
          {children}
          <ProfileGate />
          <ServiceWorkerManager />
        </ProfileProvider>
      </body>
    </html>
  );
}
