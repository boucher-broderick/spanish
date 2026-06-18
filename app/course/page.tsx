import Link from "next/link";
import { Toc } from "@/components/Toc";

export default function CoursePage() {
  return (
    <Toc
      mode="course"
      title="Course work"
      subtitle="Read the textbook and work the exercises right on the page — instant feedback."
      action={<Link href="/" className="text-sm font-semibold text-indigo-600 hover:underline">← Home</Link>}
    />
  );
}
