import { currentUser } from "@/lib/api-auth";
import { gradeCard, type CardType, type Rating } from "@/lib/cards";

// Persist one answer to a card. Single-user data; auth only gates access. Body:
//   { cardType, cardId, status, correct, rating? }
//     status  : 'new' | 'review'   (the card's status BEFORE this answer)
//     correct : boolean            (did the learner get it right)
//     rating  : 'dont_know' | 'know' | 'really_know'  (only for a correct NEW card)
export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return Response.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await req.json().catch(() => ({}))) as {
    cardType?: CardType; cardId?: string; status?: string; correct?: boolean; rating?: Rating;
  };
  if (!body.cardType || !body.cardId || !body.status || typeof body.correct !== "boolean") {
    return Response.json({ error: "cardType, cardId, status, correct required" }, { status: 400 });
  }
  const result = await gradeCard(body.cardType, body.cardId, {
    status: body.status, correct: body.correct, rating: body.rating,
  });
  return Response.json(result);
}
