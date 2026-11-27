import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

import KanjiList from "./kanji-list";

export async function generateMetadata({ params }: PageProps<"/[lang]/kanji">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.meta.kanjiTitle };
}

export default async function KanjiPage({ params }: PageProps<"/[lang]/kanji">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <KanjiList
      text={{
        locale: lang,
        kanji: dict.kanji,
        loading: dict.status.loading,
        errors: { missing: dict.status.missingKanji, loadFailed: dict.status.loadFailed },
      }}
    />
  );
}
