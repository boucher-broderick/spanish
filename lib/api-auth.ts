// Shared helper for route handlers: resolve the current user from the session
// cookie. Returns null when unauthenticated.
import { cookies } from "next/headers";
import { SESSION_COOKIE, verifySession } from "./auth";

export async function currentUser(): Promise<string | null> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  return verifySession(token);
}
