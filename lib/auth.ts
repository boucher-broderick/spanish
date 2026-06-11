// Single-user auth: credentials from ENV, signed JWT session cookie (jose, edge-safe).
import { SignJWT, jwtVerify } from "jose";

export const SESSION_COOKIE = "spc_session";
const enc = new TextEncoder();

function secretKey(): Uint8Array {
  return enc.encode(process.env.AUTH_SECRET || "dev-insecure-secret-change-me");
}

export async function createSession(username: string): Promise<string> {
  return new SignJWT({ sub: username })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuedAt()
    .setExpirationTime("30d")
    .sign(secretKey());
}

export async function verifySession(token?: string): Promise<string | null> {
  if (!token) return null;
  try {
    const { payload } = await jwtVerify(token, secretKey());
    return typeof payload.sub === "string" ? payload.sub : null;
  } catch {
    return null;
  }
}

// Constant-time-ish string compare.
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export function checkCredentials(username: string, password: string): boolean {
  const u = process.env.APP_USERNAME || "admin";
  const p = process.env.APP_PASSWORD || "spanish";
  return safeEqual(username, u) && safeEqual(password, p);
}
