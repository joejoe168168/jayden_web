import type { Metadata } from "next";
import Script from "next/script";
import "./globals.css";

export const metadata: Metadata = {
  title: "Jayden's World ⚡",
  description: "Welcome to the amazing world of Jayden - a 4-year-old superhero from Hong Kong!",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className="font-sans antialiased"
        style={{ fontFamily: '"Trebuchet MS", "Avenir Next", "Segoe UI", system-ui, sans-serif' }}
      >
        <Script id="ethereum-polyfill" strategy="beforeInteractive">
          {`
            (function () {
              if (typeof window === 'undefined') return;
              if (!window.ethereum) {
                window.ethereum = {};
              }
            })();
          `}
        </Script>
        {children}
      </body>
    </html>
  );
}
