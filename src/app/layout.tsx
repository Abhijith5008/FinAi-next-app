import type { Metadata } from "next";
import "./globals.css";
import Script from "next/script";

export const metadata: Metadata = {
  title: "Statement Analyzer",
  description: "Analyze bank statements with OCR only when needed",
  manifest: "/manifest.webmanifest",
  themeColor: "#0b1220",
  icons: {
    icon: "/icons/icon.jpg",
    apple: "/icons/icon.jpg",
    shortcut: "/icons/icon.jpg",
  },
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en">
      <body>
        {children}

        <Script id="sw-register" strategy="afterInteractive">
          {`
            if ("serviceWorker" in navigator) {
              window.addEventListener("load", () => {
                navigator.serviceWorker.register("/sw.js").catch(console.error);
              });
            }
          `}
        </Script>
      </body>
    </html>
  );
}
