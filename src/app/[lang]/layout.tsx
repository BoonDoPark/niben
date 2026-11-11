import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { notFound } from "next/navigation";

import { LanguageSwitcher } from "@/components/language-switcher";
import { NavTabs } from "@/components/nav-tabs";
import { isLocale, LOCALES } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

import "../globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

// 지원하는 언어만 미리 만들고, 그 밖의 값(/fr 등)은 404로 둔다.
export function generateStaticParams() {
  return LOCALES.map((lang) => ({ lang }));
}
export const dynamicParams = false;

export async function generateMetadata({ params }: LayoutProps<"/[lang]">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return {
    // 하위 화면은 title만 정하면 "전체 단어 — niben"처럼 붙는다.
    title: { default: dict.meta.title, template: "%s — niben" },
    description: dict.meta.description,
  };
}

export default async function RootLayout({ children, params }: LayoutProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <html
      lang={lang}
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col font-sans">
        <div className="mx-auto w-full max-w-3xl flex-1 px-4 py-10 sm:px-6 sm:py-14">
          <header className="mb-6 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
            <div>
              <h1 className="text-3xl font-bold tracking-tight">niben</h1>
              <p className="mt-2 text-zinc-600 dark:text-zinc-400">{dict.header.tagline}</p>
            </div>
            <LanguageSwitcher locale={lang} label={dict.nav.language} />
          </header>

          <NavTabs
            locale={lang}
            labels={{ nav: dict.nav.label, random: dict.nav.random, words: dict.nav.words }}
          />

          <main className="mt-6">{children}</main>

          {/* JMdict와 jiten.moe 빈도 목록은 둘 다 CC BY-SA 4.0 — 출처 표기 의무가 있다. */}
          <footer className="mt-16 space-y-1 border-t border-zinc-200 pt-6 text-xs leading-relaxed text-zinc-500 dark:border-zinc-800">
            <p>
              {dict.footer.dictionary}:{" "}
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
              {dict.footer.frequency}:{" "}
              <a href="https://jiten.moe/frequency-dictionaries" className="underline underline-offset-2">
                jiten.moe
              </a>{" "}
              {dict.footer.frequencyList},{" "}
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
