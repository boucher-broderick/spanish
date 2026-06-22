import { notFound } from "next/navigation";
import { PracticeQuiz } from "@/components/practice/PracticeQuiz";
import { ChatGame } from "@/components/practice/ChatGame";
import { WritingGame } from "@/components/practice/WritingGame";
import { ReadingGame } from "@/components/practice/ReadingGame";
import { ListeningGame } from "@/components/practice/ListeningGame";
import { GAMES } from "@/lib/practice";
import { sectionsIndex } from "@/lib/practice-words";

export default async function PracticeGamePage({ params }: { params: Promise<{ game: string }> }) {
  const { game } = await params;
  const def = GAMES[game];
  if (!def) notFound();

  if (def.kind === "drill") return <PracticeQuiz gameKey={game} />;

  // LLM games: load the unit/section index on the server, pass to the client.
  const sections = await sectionsIndex();
  switch (game) {
    case "chat": return <ChatGame sections={sections} />;
    case "writing": return <WritingGame sections={sections} />;
    case "reading": return <ReadingGame sections={sections} />;
    case "listening": return <ListeningGame sections={sections} />;
    default: notFound();
  }
}
