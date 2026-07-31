import type { Metadata, Viewport } from "next";
import "./globals.css";
import { ProfileProvider } from "@/components/app/ProfileProvider";
import { ServiceWorkerManager } from "@/components/app/ServiceWorkerManager";

export const metadata: Metadata = {
  title: {
    default: "Cortex",
    template: "%s · Cortex",
  },
  description:
    "Cortex is a self-hosted cognitive training app: short daily sessions for memory, attention and speed, with adaptive difficulty and private local storage.",
  applicationName: "Cortex",
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "black-translucent",
    title: "Cortex",
  },
  icons: {
    icon: [
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
        <ProfileProvider>{children}</ProfileProvider>
        <ServiceWorkerManager />
      </body>
    </html>
  );
}
