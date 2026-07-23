import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";

export const metadata: Metadata = {
  title: "FreeWhen · Find when your friends are actually free",
  description:
    "Paste your class schedule and instantly see when your whole friend group is free. Built at the University of Waterloo. Works for any campus.",
  manifest: "/manifest.webmanifest",
  appleWebApp: { title: "FreeWhen", capable: true, statusBarStyle: "default" },
  icons: { apple: "/apple-touch-icon.png" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#fafafa",
};

// Tiny 2×2 heatmap glyph, the product's data viz as the wordmark.
function Mark() {
  return (
    <span className="fw-mark grid grid-cols-2 gap-[2px]" aria-hidden>
      <span className="h-[7px] w-[7px] rounded-[2px] bg-green-600" />
      <span className="h-[7px] w-[7px] rounded-[2px] bg-green-300" />
      <span className="h-[7px] w-[7px] rounded-[2px] bg-green-400" />
      <span className="h-[7px] w-[7px] rounded-[2px] bg-green-500" />
    </span>
  );
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className="min-h-screen antialiased">
        <div className="flex min-h-screen flex-col">
          <header className="border-b border-stone-200 bg-white">
            <div className="mx-auto flex h-12 max-w-4xl items-center justify-between px-5">
              <Link
                href="/"
                className="flex items-center gap-2 text-sm font-semibold tracking-tight text-ink"
              >
                <Mark />
                FreeWhen
              </Link>
              <a
                href="https://github.com/ZhuBryan/FreeWhen"
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-ink-faint transition hover:text-ink"
              >
                GitHub
              </a>
            </div>
          </header>
          <main className="flex-1">{children}</main>
          <footer className="border-t border-stone-200/80 px-4 py-6 text-center text-xs text-ink-faint">
            Built at UWaterloo · works for any campus · not affiliated with the
            University of Waterloo
          </footer>
        </div>
      </body>
    </html>
  );
}
