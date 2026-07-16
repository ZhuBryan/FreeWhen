import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FreeWhen · Find when your friends are actually free",
  description:
    "Paste your UW Quest schedule and instantly see when your whole friend group is free. Built for University of Waterloo students.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#f59e0b",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <main className="flex-1">{children}</main>
          <footer className="border-t border-stone-200/70 px-4 py-6 text-center text-xs text-ink-faint">
            Built for UW students · not affiliated with the University of
            Waterloo
          </footer>
        </div>
      </body>
    </html>
  );
}
