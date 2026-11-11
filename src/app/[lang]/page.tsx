import { notFound } from "next/navigation";

import { isLocale } from "@/i18n/config";
import { getDictionary, toWordRowText } from "@/i18n/dictionaries";

import RandomWords from "./random-words";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <RandomWords
      text={{
        row: toWordRowText(lang, dict),
        random: dict.random,
        loading: dict.status.loading,
        errors: { missing: dict.status.missingStudy, loadFailed: dict.status.loadFailed },
      }}
    />
  );
}
