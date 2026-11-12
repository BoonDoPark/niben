import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isLocale } from "@/i18n/config";
import { getDictionary, toWordRowText } from "@/i18n/dictionaries";

import WordList from "./word-list";

export async function generateMetadata({ params }: PageProps<"/[lang]/words">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.meta.wordsTitle };
}

export default async function WordsPage({ params }: PageProps<"/[lang]/words">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <WordList
      text={{
        row: toWordRowText(lang, dict),
        words: dict.words,
        loading: dict.status.loading,
        errors: { missing: dict.status.missingWords, loadFailed: dict.status.loadFailed },
      }}
    />
  );
}
