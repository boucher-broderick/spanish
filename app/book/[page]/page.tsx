import { notFound } from "next/navigation";
import { getPage, allPageNumbers, allExercises, sectionTitleForPrinted, vocabForUnit, toc, pdfPageForPrinted } from "@/lib/book";
import { BookReader } from "@/components/book/BookReader";

export default async function BookPageRoute({
  params,
}: {
  params: Promise<{ page: string }>;
}) {
  const pdfPage = Number((await params).page);
  const page = getPage(pdfPage);
  if (!page) notFound();

  const nums = allPageNumbers();
  const i = nums.indexOf(pdfPage);
  const prev = i > 0 ? nums[i - 1] : null;
  const next = i >= 0 && i < nums.length - 1 ? nums[i + 1] : null;

  const exercises = allExercises().filter((e) => page.exerciseIds.includes(e.id));
  const sectionTitle = page.printedPage >= 1 ? sectionTitleForPrinted(page.printedPage) : null;
  const hasVocab = page.unit != null && (await vocabForUnit(page.unit)) != null;
  const unitToc = page.unit != null ? toc().units.find((u) => u.unit === page.unit) : null;
  const sections = unitToc
    ? unitToc.sections.map((s) => ({ title: s.title, pdfPage: pdfPageForPrinted(s.page) }))
    : [];

  return (
    <BookReader
      page={page}
      exercises={exercises}
      prev={prev}
      next={next}
      sectionTitle={sectionTitle}
      hasVocab={hasVocab}
      sections={sections}
    />
  );
}
