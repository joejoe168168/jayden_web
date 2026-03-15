import type { Metadata } from "next";
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
        {children}
      </body>
    </html>
  );
}
