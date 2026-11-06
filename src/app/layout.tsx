import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";

import { NavTabs } from "@/components/nav-tabs";

import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  // 하위 화면은 title만 정하면 "전체 단어 — niben"처럼 붙는다.
  title: { default: "niben — 일본어 단어장", template: "%s — niben" },
  description: "자주 쓰이는 순서대로 익히는 일본어 단어장",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="ko"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
          <header className="mb-6">
            <h1 className="text-3xl font-bold tracking-tight">niben</h1>
            <p className="mt-2 text-zinc-600 dark:text-zinc-400">
              자주 쓰이는 순서대로 익히는 일본어 단어장
            </p>
          </header>

          <NavTabs />

          <main className="mt-6">{children}</main>

          {/* JMdict와 jiten.moe 빈도 목록은 둘 다 CC BY-SA 4.0 — 출처 표기 의무가 있다. */}
          <footer className="mt-16 space-y-1 border-t border-zinc-200 pt-6 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800">
            <p>
              사전 데이터:{" "}
              <a
                href="https://www.edrdg.org/wiki/JMdict-EDICT_Dictionary_Project.html"
                className="underline underline-offset-2"
              >
                JMdict
              </a>{" "}
              © Electronic Dictionary Research and Development Group,{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                className="underline underline-offset-2"
              >
                CC BY-SA 4.0
              </a>
            </p>
            <p>
              빈도 데이터:{" "}
              <a href="https://jiten.moe/frequency-dictionaries" className="underline underline-offset-2">
                jiten.moe
              </a>{" "}
              전체 매체 빈도 목록,{" "}
              <a
                href="https://creativecommons.org/licenses/by-sa/4.0/"
                className="underline underline-offset-2"
              >
                CC BY-SA 4.0
              </a>
            </p>
          </footer>
        </div>
      </body>
    </html>
  );
}
