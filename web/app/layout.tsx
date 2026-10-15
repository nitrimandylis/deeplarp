import type { Metadata } from "next";
import localFont from "next/font/local";
import Link from "next/link";
import { SITE_URL, REPO_URL, OPT_OUT_URL } from "@/lib/site";
import "./globals.css";

// The card's own fonts, from the repo's assets/.
const jetbrains = localFont({
  src: [
    { path: "../../assets/JetBrainsMono-Regular.ttf", weight: "400" },
    { path: "../../assets/JetBrainsMono-Bold.ttf", weight: "700" },
  ],
  variable: "--font-jetbrains",
});
const pressStart = localFont({
  src: "../../assets/PressStart2P-Regular.ttf",
  variable: "--font-press-start",
});

export const metadata: Metadata = {
  metadataBase: new URL(SITE_URL),
  title: "deeplarp: zero larp tolerance",
  description: "Checks what a GitHub profile or repo claims against what the code shows. A 0-100 larp score, an archetype and the receipts.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${jetbrains.variable} ${pressStart.variable} antialiased`}>
      {/* group/body: the home page marks itself data-wide, and main and the footer
          widen to match it. Report pages keep the narrow reading column. */}
      <body className="group/body flex min-h-dvh flex-col">
        <header className="flex h-11 items-center border-b border-rule bg-panel px-4 text-sm">
          <div className="flex gap-2" aria-hidden>
            <span className="size-3 rounded-full bg-track" />
            <span className="size-3 rounded-full bg-track" />
            <span className="size-3 rounded-full bg-score" />
          </div>
          <Link href="/" className="mx-auto pr-13 text-muted hover:text-paper focus-visible:text-paper">
            deeplarp
          </Link>
        </header>

        <main className="mx-auto w-full max-w-3xl flex-1 px-5 py-10 group-has-data-wide/body:max-w-6xl sm:px-8 sm:py-14">{children}</main>

        <footer className="mx-auto flex w-full max-w-3xl flex-wrap group-has-data-wide/body:max-w-6xl gap-x-6 gap-y-2 px-5 pb-8 text-xs text-dim sm:px-8">
          <span>Receipts from public GitHub data, not a verdict on intent.</span>
          <a href={REPO_URL} className="underline-offset-4 hover:text-muted hover:underline">Source</a>
          <a href={OPT_OUT_URL} className="underline-offset-4 hover:text-muted hover:underline">Opt out</a>
        </footer>
      </body>
    </html>
  );
}
