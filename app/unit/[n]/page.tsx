import { notFound } from "next/navigation";
import { pagesForUnit, toc, pdfPageForPrinted } from "@/lib/book";
import { UnitReader } from "@/components/book/UnitReader";

export default async function UnitPage({ params }: { params: Promise<{ n: string }> }) {
  const unit = Number((await params).n);
  const pages = pagesForUnit(unit);
  if (!pages.length) notFound();

  const units = toc().units;
  const unitToc = units.find((u) => u.unit === unit);
  const unitTitle = unitToc?.title ?? "";
  const sections = (unitToc?.sections ?? []).map((s) => ({
    title: s.title,
    pdfPage: pdfPageForPrinted(s.page),
  }));
  const nextUnit = units.some((u) => u.unit === unit + 1) ? unit + 1 : null;

  return (
    <UnitReader
      unit={unit}
      unitTitle={unitTitle}
      pages={pages}
      sections={sections}
      nextUnit={nextUnit}
    />
  );
}
