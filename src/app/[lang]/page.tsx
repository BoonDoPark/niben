import { notFound } from "next/navigation";
import { Suspense } from "react";

import { LoadingMessage } from "@/components/word-row";
import { isLocale } from "@/i18n/config";
import { getDictionary, toWordRowText } from "@/i18n/dictionaries";

import RandomWords from "./random-words";

export default async function Home({ params }: PageProps<"/[lang]">) {
  const { lang } = await params;
  if (!isLocale(lang)) notFound();
  const dict = await getDictionary(lang);

  // 목록 안에서 주소의 ?w=(단어 상세)를 읽으므로(useSearchParams) Suspense 로 감싼다.
  return (
    <Suspense fallback={<LoadingMessage text={dict.status.loading} />}>
      <RandomWords
        text={{
          row: toWordRowText(lang, dict),
          random: dict.random,
          loading: dict.status.loading,
          errors: { missing: dict.status.missingStudy, loadFailed: dict.status.loadFailed },
        }}
      />
    </Suspense>
  );
}
