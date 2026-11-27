import type { Metadata } from "next";
import { notFound } from "next/navigation";

import { isLocale } from "@/i18n/config";
import { getDictionary } from "@/i18n/dictionaries";

import GrammarList from "./grammar-list";

export async function generateMetadata({ params }: PageProps<"/[lang]/grammar">): Promise<Metadata> {
  const { lang } = await params;
  if (!isLocale(lang)) return {};
  const dict = await getDictionary(lang);
  return { title: dict.meta.grammarTitle };
}

export default async function GrammarPage({ params }: PageProps<"/[lang]/grammar">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  return (
    <GrammarList
      text={{
        locale: lang,
        grammar: dict.grammar,
        loading: dict.status.loading,
        errors: { missing: dict.status.missingGrammar, loadFailed: dict.status.loadFailed },
      }}
    />
  );
}
