import type { Metadata } from "next";

import WordList from "./word-list";

export const metadata: Metadata = {
  title: "전체 단어",
};

export default function WordsPage() {
  return <WordList />;
}
