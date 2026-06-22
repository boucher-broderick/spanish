import Link from "next/link";
import { Toc } from "@/components/Toc";
import { allVocab } from "@/lib/book";

export default async function VocabTocPage() {
  const available = new Set((await allVocab()).map((u) => u.unit));
  return (
    <Toc
      mode="vocab"
      availableUnits={available}
      title="Vocabulary"
      subtitle="Pick a unit to see its verbs, nouns, adjectives, adverbs, and expressions by section."
      action={<Link href="/" className="text-sm font-semibold text-indigo-600 hover:underline">← Home</Link>}
    />
  );
}
